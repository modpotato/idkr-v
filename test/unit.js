"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const AdBlocker = require("../app/modules/adblocker");
const RequestManager = require("../app/modules/request-manager");
const Swapper = require("../app/modules/swapper");

let checks = 0;

function test(name, fn) {
	checks++;
	try {
		fn();
		console.log(`PASS ${name}`);
	}
	catch (err) {
		console.error(`FAIL ${name}`);
		console.error(err);
		process.exitCode = 1;
	}
}

function config(value) {
	return { get: (key, fallback) => key === "blockAds" ? value : fallback };
}

console.log("AdBlocker");

test("blocks ad providers", () => {
	for (const url of [
		"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
		"https://googleads.g.doubleclick.net/pagead/id",
		"https://securepubads.g.doubleclick.net/tag/js/gpt.js",
		"https://www.googletagmanager.com/gtag/js?id=G-TEST",
		"https://fundingchoicesmessages.google.com/i/test",
		"https://adservice.google.com/pagead/1p-user-list",
		"https://imasdk.googleapis.com/js/sdkloader/ima3.js",
		"https://c.amazon-adsystem.com/aax2/apstag.js",
		"https://s0.2mdn.net/ads/richmedia/studio/test.js"
	]) assert.strictEqual(AdBlocker.isAdUrl(url), true, url);
});

test("does not block game or service traffic", () => {
	for (const url of [
		"https://krunker.io/",
		"https://assets.krunker.io/textures/recticle.png?build=test",
		"https://www.krunker.io/social.html",
		"https://comp.krunker.io/",
		"https://api.krunker.io/",
		"https://matchmaker.krunker.io/",
		"https://crucible.frvr.com/v1/auth/login",
		"https://challenges.cloudflare.com/cdn-cgi/challenge-platform/test",
		"https://apis.google.com/js/platform.js",
		"https://www.google-analytics.com/g/collect",
		"file:///C:/Windows/System32/drivers/etc/hosts",
		"not a url"
	]) assert.strictEqual(AdBlocker.isAdUrl(url), false, url);
});

test("respects the blockAds setting", () => {
	const blocked = { url: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" };
	assert.deepStrictEqual(new AdBlocker(config(true)).handleRequest(blocked), { cancel: true });
	assert.strictEqual(new AdBlocker(config(false)).handleRequest(blocked), null);
});

console.log("\nRequestManager");

test("dispatches to the first matching handler", () => {
	let listener;
	const session = { webRequest: { onBeforeRequest: fn => (listener = fn) } };
	const manager = RequestManager.for(session);
	manager.addHandler(() => null);
	manager.addHandler(() => ({ cancel: true }));
	manager.addHandler(() => ({ redirectURL: "too-late" }));

	let response;
	listener({ url: "https://example.com/" }, value => (response = value));
	assert.deepStrictEqual(response, { cancel: true });
});

test("calls back with an empty response when nothing matches", () => {
	let listener;
	const session = { webRequest: { onBeforeRequest: fn => (listener = fn) } };
	const manager = RequestManager.for(session);
	manager.addHandler(() => null);

	let response;
	listener({ url: "https://example.com/" }, value => (response = value));
	assert.deepStrictEqual(response, {});
});

console.log("\nSwapper");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "idkr-swapper-test-"));

function write(file, content = "test") {
	let full = path.join(tmp, file);
	fs.mkdirSync(path.dirname(full), { recursive: true });
	fs.writeFileSync(full, content);
}

write("normal/root.txt");
write("normal/img/asset.png");
write("normal/textures/asset.png");
write("advanced/assets.krunker.io/textures/advanced.png");
write("advanced/krunker.io/root.txt");

function swapper(mode, dir) {
	const manager = { handler: null, addHandler(fn) { this.handler = fn; } };
	const instance = new Swapper(mode, path.join(tmp, dir));
	instance.init(manager);
	return { instance, handler: manager.handler };
}

function redirects(handler, url) {
	const result = handler({ url });
	return result ? result.redirectURL : undefined;
}

test("normal mode swaps root, img and asset paths", () => {
	const { handler } = swapper("normal", "normal");
	assert.ok(redirects(handler, "https://krunker.io/root.txt?build=1").endsWith(path.join("normal", "root.txt")));
	assert.ok(redirects(handler, "https://comp.krunker.io/root.txt").endsWith(path.join("normal", "root.txt")));
	assert.ok(redirects(handler, "https://assets.krunker.io/img/asset.png").endsWith(path.join("normal", "img", "asset.png")));
	assert.ok(redirects(handler, "https://krunker.io/img/asset.png").endsWith(path.join("normal", "img", "asset.png")));
	assert.ok(redirects(handler, "http://assets.krunker.io/textures/asset.png").endsWith(path.join("normal", "textures", "asset.png")));
});

test("normal mode only swaps asset folders on the asset host", () => {
	const { handler } = swapper("normal", "normal");
	assert.strictEqual(redirects(handler, "https://krunker.io/textures/asset.png"), undefined);
	assert.strictEqual(redirects(handler, "https://assets.krunker.io/root.txt"), undefined);
	assert.strictEqual(redirects(handler, "https://assets.krunker.io/other.png"), undefined);
	assert.strictEqual(redirects(handler, "file:///root.txt"), undefined);
});

test("advanced mode uses the hostname directory", () => {
	const { handler } = swapper("advanced", "advanced");
	assert.ok(redirects(handler, "https://assets.krunker.io/textures/advanced.png?build=1")
		.endsWith(path.join("advanced", "assets.krunker.io", "textures", "advanced.png")));
	assert.ok(redirects(handler, "https://krunker.io/root.txt")
		.endsWith(path.join("advanced", "krunker.io", "root.txt")));
	assert.strictEqual(redirects(handler, "https://www.krunker.io/root.txt"), undefined);
	assert.strictEqual(redirects(handler, "https://assets.krunker.io/other.png"), undefined);
});

test("disabled mode registers no handler", () => {
	const manager = { handler: null, addHandler(fn) { this.handler = fn; } };
	new Swapper("disabled", path.join(tmp, "normal")).init(manager);
	assert.strictEqual(manager.handler, null);
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${checks} checks run`);
if (process.exitCode) process.exit(process.exitCode);
