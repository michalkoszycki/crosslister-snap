// pc.js -- every call the page makes to the home PC (`crosslister serve`).
//
//   POST <pc>/jobs        multipart: venue, note, ai, photos (1-24) -- or venue and sku
//                         -> {"job": id, "state": "queued", "ahead": n}
//   GET  <pc>/jobs/<id>   -> {"state", "step", "sku", "links": {venue: url}, "error", "ahead"}
//   GET  <pc>/jobs?limit=1  the Settings check: answers only to a right key, costs nothing
//
// Every call carries the key in the X-Crosslister-Key header. Errors come back
// as JSON {"detail": "..."}; errorText() in core.js turns them into one line.

import { errorText, KEY_HEADER } from "./core.js?v=1.3.0";

/** An error with the HTTP status (0 = the PC could not be reached). */
export class PcError extends Error {
    constructor(status, detail) {
        super(errorText(status, detail));
        this.name = "PcError";
        this.status = status;
    }
}

/**
 * The multipart body for POST /jobs.
 * @param {[string,string][]} fields  from jobRequest() in core.js
 * @param {{blob:Blob, name:string}[]} files  the photos, in the order the ai positions count
 * @returns {FormData}
 */
export function buildJobForm(fields, files) {
    const form = new FormData();
    for (const [name, value] of fields) form.append(name, value);
    for (const f of files) form.append("photos", f.blob, f.name);
    return form;
}

async function call(url, key, init = {}) {
    let res;
    try {
        res = await fetch(url, {
            ...init,
            headers: { [KEY_HEADER]: key },
            cache: "no-store",
            referrerPolicy: "no-referrer",
        });
    } catch {
        throw new PcError(0);
    }
    let body = null;
    try {
        body = await res.json();
    } catch {
        body = null;
    }
    if (!res.ok) throw new PcError(res.status, body && body.detail);
    if (!body || typeof body !== "object") throw new PcError(res.status, "the PC gave no answer");
    return body;
}

/**
 * Send one job.
 * @param {{pc:string, key:string}} settings
 * @param {FormData} form
 * @returns {Promise<{job:string, state:string, ahead:number}>}
 */
export function postJob({ pc, key }, form) {
    return call(`${pc}/jobs`, key, { method: "POST", body: form });
}

/**
 * One job's status.
 * @param {{pc:string, key:string}} settings
 * @param {string} jobId
 */
export function getJob({ pc, key }, jobId) {
    return call(`${pc}/jobs/${encodeURIComponent(jobId)}`, key);
}

/**
 * The Settings check: does the PC answer, and does it know this key?
 * Reads the newest job only; no model call, nothing published.
 * @param {{pc:string, key:string}} settings
 */
export function checkPc({ pc, key }) {
    return call(`${pc}/jobs?limit=1`, key);
}
