"use strict";

/** @type {WeakMap<Electron.Session, RequestManager>} */
const managers = new WeakMap();

/**
 * Owns the single webRequest listener of a session and dispatches
 * every request to the registered handlers.
 *
 * Electron only supports one onBeforeRequest listener per session,
 * so the ad blocker and the resource swapper both register here.
 *
 * @class RequestManager
 */
class RequestManager {
	/**
	 * @param {Electron.Session} session
	 * @memberof RequestManager
	 */
	constructor(session) {
		this.session = session;
		/** @type {((details: Electron.OnBeforeRequestListenerDetails) => Electron.CallbackResponse | null)[]} */
		this.handlers = [];

		session.webRequest.onBeforeRequest((details, callback) => this.#dispatch(details, callback));
	}

	/**
	 * Get the manager for a session, creating it on first use
	 *
	 * @static
	 * @param {Electron.Session} session
	 * @returns {RequestManager}
	 * @memberof RequestManager
	 */
	static for(session) {
		let manager = managers.get(session);
		if (!manager) {
			manager = new RequestManager(session);
			managers.set(session, manager);
		}
		return manager;
	}

	/**
	 * Register a request handler. The first handler that returns
	 * a response wins; null/undefined means "not my request".
	 *
	 * @param {(details: Electron.OnBeforeRequestListenerDetails) => Electron.CallbackResponse | null} handler
	 * @memberof RequestManager
	 */
	addHandler(handler) {
		if (!this.handlers.includes(handler)) this.handlers.push(handler);
	}

	/**
	 * @private
	 * @param {Electron.OnBeforeRequestListenerDetails} details
	 * @param {(response: Electron.CallbackResponse) => void} callback
	 * @memberof RequestManager
	 */
	#dispatch(details, callback) {
		for (let handler of this.handlers) {
			let response = null;
			try {
				response = handler(details);
			}
			catch (err) {
				console.error("[idkr] Request handler failed", err);
			}
			if (response) {
				callback(response);
				return;
			}
		}
		callback({});
	}
}

module.exports = RequestManager;
