"use strict";

class SocialOnlyScript {
	constructor() {
		this.meta = {
			name: "Social Only",
			version: "1.0",
			author: "idkr-v tests",
			description: "Must not run on the game page"
		};
		this.config = {
			apiversion: "1.0",
			locations: ["social"],
			platforms: ["all"],
			settings: {}
		};
		this.clientUtils = null;
	}

	load() {
		window.__idkrSocialOnlyScript = true;
	}

	unload() {
		window.__idkrSocialOnlyScript = undefined;
	}
}

return new SocialOnlyScript();
