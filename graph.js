// graph.js -- every Microsoft Graph call this app makes.
//
// 1. POST .../me/drive/root:/Pictures/Uploads/<item>/<file>:/createUploadSession
//    -> { uploadUrl, expirationDateTime }
// 2. PUT <uploadUrl> with a Content-Range for each byte range. The answer to
//    the LAST range is the finished driveItem, and its `id` is what a later
//    delete needs, so it is kept.
// 3. PUT .../me/drive/root:/<path>/note.txt:/content -- the whole note in one
//    call, which replaces any note.txt already there.
// 4. DELETE .../me/drive/items/{id} -- the x on a thumbnail.
//
// Docs:
//  createUploadSession (byte ranges, no Authorization on the PUT):
//   https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
//  small-file upload, "up to 250 MB", Content-Type required, returns the driveItem:
//   https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0
//  delete, "moves the items to the recycle bin", 204 No Content, and
//  Files.ReadWrite is the least-privileged delegated permission for a personal
//  Microsoft account -- the scope this app already asks for:
//   https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0
//  CORS from a browser:
//   https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors
//
// Two things the docs are explicit about and that are easy to get wrong:
//  * every byte range but the last must be a multiple of 320 KiB;
//  * the PUT to uploadUrl must NOT carry the Authorization header (the upload
//    URL is pre-authenticated; sending the bearer token can give a 401).

import { driveItemUrl, fileContentUrl, planRanges, uploadSessionUrl } from "./core.js?v=1.1.0";

/** An error that carries the HTTP status, so retry logic can look at it. */
export class UploadError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "UploadError";
        this.status = status;
    }
}

/** Thrown when the caller cancelled (the x on a thumbnail mid-upload). */
export class CancelledError extends Error {
    constructor() {
        super("cancelled");
        this.name = "CancelledError";
        this.cancelled = true;
        this.status = 0;
    }
}

/**
 * Ask Graph for an upload session. The folders in the path are created
 * implicitly, so no separate "create folder" call is needed.
 *
 * @param {object} o
 * @param {string} o.accessToken
 * @param {string} o.basePath
 * @param {string} o.itemName
 * @param {string} o.fileName
 * @param {number} o.fileSize
 * @param {string} [o.graphRoot]
 * @returns {Promise<string>} the uploadUrl
 */
export async function createUploadSession({
    accessToken,
    basePath,
    itemName,
    fileName,
    fileSize,
    graphRoot,
    signal,
}) {
    const url = uploadSessionUrl(basePath, itemName, fileName, graphRoot);
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            signal,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            // The smallest body Graph accepts. A personal OneDrive answered
            // 400 "Invalid request" to the fuller one (name, fileSize and
            // deferCommit, which is a OneDrive for Business / SharePoint
            // option) on Michal's first real upload, 2026-09-19. The file name
            // is already in the URL path.
            body: JSON.stringify({
                item: { "@microsoft.graph.conflictBehavior": "rename" },
            }),
        });
    } catch (e) {
        if (e && e.name === "AbortError") throw new CancelledError();
        throw new UploadError(`network error: ${e.message}`, 0);
    }
    if (!res.ok) {
        throw new UploadError(
            `createUploadSession failed (${res.status}) ${await safeText(res)}`,
            res.status
        );
    }
    const body = await res.json();
    if (!body || !body.uploadUrl) {
        throw new UploadError("createUploadSession returned no uploadUrl", res.status);
    }
    return body.uploadUrl;
}

/**
 * PUT the file at the upload URL, one range at a time, in order.
 *
 * @param {object} o
 * @param {string} o.uploadUrl
 * @param {Blob} o.file
 * @param {(fraction:number)=>void} [o.onProgress]
 * @param {number} [o.chunkSize]
 * @returns {Promise<object>} the finished driveItem
 */
export async function uploadRanges({ uploadUrl, file, onProgress, chunkSize, signal }) {
    const size = file.size;
    const ranges = planRanges(size, chunkSize);
    let last = null;
    for (const range of ranges) {
        const slice = file.slice(range.start, range.end + 1);
        // eslint-disable-next-line no-await-in-loop
        const r = await putRange(
            uploadUrl,
            slice,
            range,
            size,
            (sent) => {
                if (onProgress) onProgress(Math.min(1, (range.start + sent) / size));
            },
            signal
        );
        last = r;
    }
    if (onProgress) onProgress(1);
    // The answer to the final range is the created driveItem: { id, name, ... }.
    return last;
}

/**
 * One PUT. XMLHttpRequest rather than fetch, because it reports upload
 * progress, which is what drives the per-photo progress bar.
 */
function putRange(uploadUrl, blob, range, totalSize, onSent, signal) {
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            reject(new CancelledError());
            return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        // No Authorization header here -- see the note at the top of this file.
        xhr.setRequestHeader("Content-Range", range.contentRange);
        if (signal) signal.addEventListener("abort", () => xhr.abort(), { once: true });
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onSent) onSent(e.loaded);
        };
        xhr.onabort = () => reject(new CancelledError());
        xhr.onerror = () =>
            reject(new UploadError("network error while uploading bytes", 0));
        xhr.ontimeout = () => reject(new UploadError("upload timed out", 0));
        xhr.onload = () => {
            const ok = xhr.status === 200 || xhr.status === 201 || xhr.status === 202;
            if (!ok) {
                reject(
                    new UploadError(
                        `upload range failed (${xhr.status}) ${(xhr.responseText || "").slice(0, 200)}`,
                        xhr.status
                    )
                );
                return;
            }
            let body = null;
            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                body = null;
            }
            resolve(body);
        };
        xhr.send(blob);
    });
}

/**
 * Upload one photo end to end.
 * @returns {Promise<object>} the finished driveItem
 */
export async function uploadPhoto({
    accessToken,
    basePath,
    itemName,
    fileName,
    file,
    graphRoot,
    onProgress,
    signal,
}) {
    const uploadUrl = await createUploadSession({
        accessToken,
        basePath,
        itemName,
        fileName,
        fileSize: file.size,
        graphRoot,
        signal,
    });
    return uploadRanges({ uploadUrl, file, onProgress, signal });
}

/**
 * Write a small text file in one call, replacing whatever is at that path.
 *
 * PUT /me/drive/root:/<path>:/content, per
 * https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0
 * ("up to 250 MB"; Content-Type required; returns the driveItem). Uploading to
 * a path that already holds a file replaces its contents, which is exactly the
 * "one note per item, last one wins" we want -- and no @microsoft.graph.
 * conflictBehavior is passed, deliberately: the fuller createUploadSession body
 * is what a personal OneDrive rejected with a 400 on 2026-09-19, so every call
 * here stays as plain as the docs allow.
 *
 * @param {object} o
 * @param {string} o.accessToken
 * @param {string} o.basePath
 * @param {string} o.itemName
 * @param {string} o.fileName
 * @param {string} o.text
 * @param {string} [o.graphRoot]
 * @returns {Promise<object>} the driveItem, whose id allows a later delete
 */
export async function uploadTextFile({
    accessToken,
    basePath,
    itemName,
    fileName,
    text,
    graphRoot,
}) {
    const url = fileContentUrl(basePath, itemName, fileName, graphRoot);
    // A Blob, so the bytes on the wire are UTF-8 and the length is right for
    // any character he types (accents, emoji, curly quotes).
    const body = new Blob([text], { type: "text/plain;charset=utf-8" });
    let res;
    try {
        res = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "text/plain;charset=utf-8",
            },
            body,
        });
    } catch (e) {
        throw new UploadError(`network error: ${e.message}`, 0);
    }
    if (!res.ok) {
        throw new UploadError(
            `saving ${fileName} failed (${res.status}) ${await safeText(res)}`,
            res.status
        );
    }
    try {
        return await res.json();
    } catch {
        return {};
    }
}

/**
 * Delete one drive item by id.
 *
 * DELETE /me/drive/items/{item-id} -> 204 No Content, per
 * https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0
 * Delegated Files.ReadWrite is the least-privileged permission for a personal
 * Microsoft account, so this needs no new consent. The file goes to the
 * OneDrive recycle bin, not to nothing.
 *
 * A 404 means it is already gone, which is the outcome we wanted anyway.
 *
 * @param {object} o
 * @param {string} o.accessToken
 * @param {string} o.itemId
 * @param {string} [o.graphRoot]
 * @returns {Promise<void>}
 */
export async function deleteDriveItem({ accessToken, itemId, graphRoot }) {
    let res;
    try {
        res = await fetch(driveItemUrl(itemId, graphRoot), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
        });
    } catch (e) {
        throw new UploadError(`network error: ${e.message}`, 0);
    }
    if (res.status === 204 || res.status === 200 || res.status === 404) return;
    throw new UploadError(`delete failed (${res.status}) ${await safeText(res)}`, res.status);
}

async function safeText(res) {
    try {
        return (await res.text()).slice(0, 200);
    } catch {
        return "";
    }
}
