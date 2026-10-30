"use strict";

// Hosts that only serve advertising, ad verification or ad analytics.
// Matched against the hostname and all of its subdomains.
const BLOCKED_HOSTS = [
	"googlesyndication.com",
	"doubleclick.net",
	"googleadservices.com",
	"googletagservices.com",
	"googletagmanager.com",
	"fundingchoicesmessages.google.com",
	"adservice.google.com",
	"imasdk.googleapis.com",
	"amazon-adsystem.com",
	"2mdn.net"
];

/**
 * @param {string} hostname
 * @param {string} domain
 * @returns {boolean}
 */
function hostMatches(hostname, domain) {
	return hostname === domain || hostname.endsWith("." + domain);
}

/**
 * Blocks Krunker's ad requests (the FRVR SDK loads Google AdSense).
 *
 * @class AdBlocker
 */
class AdBlocker {
	/**
	 * @param {import("electron-store")} config
	 * @memberof AdBlocker
	 */
	constructor(config) {
		this.config = config;
		this.enabled = config.get("blockAds", true) !== false;
		this.handler = details => this.handleRequest(details);
	}

	/**
	 * Check whether ads are currently enabled in the client settings
	 *
	 * @returns {boolean}
	 * @memberof AdBlocker
	 */
	isEnabled() {
		return this.enabled;
	}

	/**
	 * Update the live state without rewriting the config file
	 *
	 * @param {boolean} enabled
	 * @memberof AdBlocker
	 */
	setEnabled(enabled) {
		this.enabled = enabled !== false;
	}

	/**
	 * Check if a URL belongs to an ad provider
	 *
	 * @static
	 * @param {string} url
	 * @returns {boolean}
	 * @memberof AdBlocker
	 */
	static isAdUrl(url) {
		let parsed;
		try {
			parsed = new URL(url);
		}
		catch {
			return false;
		}

		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

		return BLOCKED_HOSTS.some(domain => hostMatches(parsed.hostname.toLowerCase(), domain));
	}

	/**
	 * @param {Electron.OnBeforeRequestListenerDetails} details
	 * @returns {Electron.CallbackResponse | null}
	 * @memberof AdBlocker
	 */
	handleRequest(details) {
		if (!this.isEnabled()) return null;
		return AdBlocker.isAdUrl(details.url) ? { cancel: true } : null;
	}
}

module.exports = AdBlocker;
