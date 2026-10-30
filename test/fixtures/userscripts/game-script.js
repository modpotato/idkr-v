"use strict";

class TestUserscript {
	constructor() {
		this.meta = {
			name: "Headless Test Script",
			version: "1.0",
			author: "idkr-v tests",
			description: "Used by the headless client checks"
		};
		this.config = {
			apiversion: "1.0",
			locations: ["game"],
			platforms: ["all"],
			settings: {
				userscriptTest: {
					id: "userscriptTest",
					name: "Test Setting",
					cat: "Test Scripts",
					type: "select",
					options: {
						alpha: "Alpha",
						beta: "Beta"
					},
					val: "alpha",
					html: () => this.clientUtils.genCSettingsHTML(this.config.settings.userscriptTest)
				}
			}
		};
		this.clientUtils = null;
	}

	load(config) {
		window.__idkrTestUserscript = {
			ran: true,
			configValue: config.get("userscriptTest", "missing"),
			settingValue: this.clientUtils && this.clientUtils.settings.userscriptTest
				? this.clientUtils.settings.userscriptTest.val
				: "missing",
			hasUtils: Boolean(this.clientUtils) && typeof this.clientUtils.setCSetting === "function"
		};
	}

	unload() {
		window.__idkrTestUserscript = undefined;
	}
}

return new TestUserscript();
