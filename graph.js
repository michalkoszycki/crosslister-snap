// graph.js -- the two Microsoft Graph calls this app makes.
//
// 1. POST .../me/drive/root:/Pictures/Uploads/<item>/<file>:/createUploadSession
//    -> { uploadUrl, expirationDateTime }
// 2. PUT <uploadUrl> with a Content-Range for each byte range.
//
// Docs:
//  https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
//  https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors
//
// Two things the docs are explicit about and that are easy to get wrong:
//  * every byte range but the last must be a multiple of 320 KiB;
//  * the PUT to uploadUrl must NOT carry the Authorization header (the upload
//    URL is pre-authenticated; sending the bearer token can give a 401).

import { planRanges, uploadSessionUrl } from "./core.js";

/** An error that carries the HTTP status, so retry logic can look at it. */
export class UploadError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = "UploadError";
        this.status = status;
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
}) {
    const url = uploadSessionUrl(basePath, itemName, fileName, graphRoot);
    let res;
    try {
        res = await fetch(url, {
            method: "POST",
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
export async function uploadRanges({ uploadUrl, file, onProgress, chunkSize }) {
    const size = file.size;
    const ranges = planRanges(size, chunkSize);
    let last = null;
    for (const range of ranges) {
        const slice = file.slice(range.start, range.end + 1);
        // eslint-disable-next-line no-await-in-loop
        const r = await putRange(uploadUrl, slice, range, size, (sent) => {
            if (onProgress) onProgress(Math.min(1, (range.start + sent) / size));
        });
        last = r;
    }
    if (onProgress) onProgress(1);
    return last;
}

/**
 * One PUT. XMLHttpRequest rather than fetch, because it reports upload
 * progress, which is what drives the per-photo progress bar.
 */
function putRange(uploadUrl, blob, range, totalSize, onSent) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        // No Authorization header here -- see the note at the top of this file.
        xhr.setRequestHeader("Content-Range", range.contentRange);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onSent) onSent(e.loaded);
        };
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
}) {
    const uploadUrl = await createUploadSession({
        accessToken,
        basePath,
        itemName,
        fileName,
        fileSize: file.size,
        graphRoot,
    });
    return uploadRanges({ uploadUrl, file, onProgress });
}

async function safeText(res) {
    try {
        return (await res.text()).slice(0, 200);
    } catch {
        return "";
    }
}
