// camera.js -- the in-page camera. The only file that touches getUserMedia and
// ImageCapture, so app.js stays screen-only and tests can stub this whole thing.
//
// Docs used:
//  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
//      constraint syntax (facingMode ideal/exact, width/height ideal), the
//      exception names, and "only available in secure contexts" -- https and
//      localhost, which is what we serve from.
//  https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/takePhoto
//      new ImageCapture(track); takePhoto(photoSettings) -> Promise<Blob>;
//      throws InvalidStateError unless track.readyState === "live".
//  https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture/getPhotoCapabilities
//      { imageWidth: {min,max,step}, imageHeight: {min,max,step}, ... } --
//      where the "largest still the camera offers" comes from.
//
// Chrome on Android has ImageCapture; Firefox and Safari do not. Where it is
// missing or throws, we draw the live video frame onto a canvas instead, which
// gives the preview's resolution rather than the sensor's full still.

/** What we ask the camera for: the back one, as many pixels as it will give. */
export const VIDEO_CONSTRAINTS = {
    facingMode: { ideal: "environment" },
    // "ideal" and not "exact"/"min": an impossible ideal is quietly narrowed to
    // the best the device has, where an unmet exact constraint is an
    // OverconstrainedError and no camera at all.
    width: { ideal: 4096 },
    height: { ideal: 4096 },
};

/** True when this browser can even try. Undefined on http:// (not a secure context). */
export function cameraSupported(nav = globalThis.navigator) {
    return !!(nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function");
}

/**
 * Create the camera controller. Nothing happens until start() is called, so
 * the permission prompt only appears on a tap.
 *
 * @param {object} [deps] injection points for tests
 * @param {Navigator} [deps.nav]
 * @param {Function} [deps.imageCaptureCtor]
 * @param {Document} [deps.doc]
 * @returns {{start:Function, capture:Function, stop:Function, isActive:Function, lastMode:Function}}
 */
export function createCamera(deps = {}) {
    const nav = deps.nav || globalThis.navigator;
    const doc = deps.doc || globalThis.document;
    const ImageCaptureCtor =
        "imageCaptureCtor" in deps ? deps.imageCaptureCtor : globalThis.ImageCapture;

    let stream = null;
    let track = null;
    let imageCapture = null;
    let photoSettings = null;
    let videoEl = null;
    let lastMode = "none";

    async function start(video) {
        if (!cameraSupported(nav)) {
            const e = new Error("this browser has no camera API here");
            e.name = "NotSupportedError";
            throw e;
        }
        stop();
        stream = await nav.mediaDevices.getUserMedia({
            video: VIDEO_CONSTRAINTS,
            audio: false,
        });
        track = stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
        videoEl = video;
        if (video) {
            video.srcObject = stream;
            video.setAttribute("playsinline", "");
            video.muted = true;
            try {
                await video.play();
            } catch {
                /* autoplay refused: the preview still paints on first frame */
            }
        }
        await prepareStills();
        return { stream, track };
    }

    /** Set up ImageCapture and pick the largest still size it admits to. */
    async function prepareStills() {
        imageCapture = null;
        photoSettings = null;
        if (!ImageCaptureCtor || !track) return;
        try {
            imageCapture = new ImageCaptureCtor(track);
        } catch {
            imageCapture = null;
            return;
        }
        try {
            const caps = await imageCapture.getPhotoCapabilities();
            const w = caps && caps.imageWidth ? caps.imageWidth.max : 0;
            const h = caps && caps.imageHeight ? caps.imageHeight.max : 0;
            if (w > 0 && h > 0) photoSettings = { imageWidth: w, imageHeight: h };
        } catch {
            // getPhotoCapabilities is the part Chrome is flakiest about; a
            // takePhoto() with no settings still gives the camera's default still.
            photoSettings = null;
        }
    }

    /**
     * One shot, straight away. The preview keeps running.
     * @returns {Promise<Blob>} a JPEG (ImageCapture) or a canvas JPEG (fallback)
     */
    async function capture() {
        if (!stream) throw new Error("the camera is not running");
        if (imageCapture && track && track.readyState === "live") {
            try {
                const blob = await (photoSettings
                    ? imageCapture.takePhoto(photoSettings)
                    : imageCapture.takePhoto());
                if (blob && blob.size > 0) {
                    lastMode = "ImageCapture";
                    return blob;
                }
            } catch {
                // fall through to the canvas
            }
        }
        const blob = await frameToJpeg();
        lastMode = "canvas";
        return blob;
    }

    /** The fallback: whatever the preview is showing, as a JPEG. */
    function frameToJpeg() {
        return new Promise((resolve, reject) => {
            if (!videoEl) {
                reject(new Error("no preview to capture from"));
                return;
            }
            const w = videoEl.videoWidth || 0;
            const h = videoEl.videoHeight || 0;
            if (!w || !h) {
                reject(new Error("the preview has no picture yet - try again"));
                return;
            }
            const canvas = doc.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d").drawImage(videoEl, 0, 0, w, h);
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error("could not make a JPEG"))),
                "image/jpeg",
                0.92
            );
        });
    }

    /** Release the camera. Android shows the "in use" light until this runs. */
    function stop() {
        if (stream && stream.getTracks) {
            for (const t of stream.getTracks()) t.stop();
        }
        if (videoEl) videoEl.srcObject = null;
        stream = null;
        track = null;
        imageCapture = null;
        photoSettings = null;
    }

    return {
        start,
        capture,
        stop,
        isActive: () => !!stream,
        /** "ImageCapture" or "canvas" -- which path the last shot took. */
        lastMode: () => lastMode,
    };
}
