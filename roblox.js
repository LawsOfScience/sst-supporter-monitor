class RobloxClient {
    RobloxClient(roblosecurity) {
        this.session = {
            "cookie": `.ROBLOSECURITY=${roblosecurity}`
        };
        this.logged_in = false;
    };

    async requestRoblox(url, options) {
        let _this = this;
        options.headers = _this.session;

        const response = await fetch(url, options);
        const redirect = response.headers.get("location");

        if (redirect.toLowerCase().includes("login")) {
            throw new Error("Roblox cookie is invalid, cannot log in");
        };

        const token = response.headers.get("x-csrf-token");

        if (!this.logged_in) {
            const logout_response = await fetch("https://auth.roblox.com/v2/logout", {
                method: "POST",
                headers: _this.session,
                redirect: "error"
            });

            if (logout_response.headers.get("x-csrf-token")) {
                const newToken = logout_response.headers.get("x-csrf-token");

                _this.session["token"] = newToken;
            } else {
                throw new Error("Failed to get token during login");
            };
        };

        if (response.statusText.includes("Token Validation Failed") && this.logged_in) {
            if (token) {
                // Retry
                _this.session["token"] = token;
                await this.requestRoblox(url, options);
            } else {
                throw new Error("Failed to get token after login, session likely invalidated");
            }
        }

        return response;
    };

    async login() {
        let _this = this;

        try {
            const response = await this.requestRoblox("https://www.roblox.com/mobileapi/userinfo", {
                method: "GET",
                redirect: "manual"
            });

            if (response.status / 100 == 2) {
                const accountInfo = await response.json();
                this.logged_in = true;

                console.log(`Logged in as ${accountInfo.UserName}`);
            }
        } catch (err) {
            throw new Error("Error logging in");
        }
    };
}

module.exports = RobloxClient;
