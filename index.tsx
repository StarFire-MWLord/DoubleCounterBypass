/*
 * DoubleCounterBypass - Vencord custom plugin
 * Makes DoubleCounter think your alt is your main (high ban risk!)
 */

import definePlugin from "@utils/types";  // Note: no { OptionType } needed here
import { FluxDispatcher } from "@webpack/common";
import { UserStore } from "@webpack/common";

interface OriginalUserData {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    globalName: string | null;
    publicFlags: number | null;
}

export default definePlugin({
    name: "DoubleCounterBypass",
    description: "Makes DoubleCounter think your alt account is your main account (very high ban risk - use alt accounts only!)",
    authors: authors: [{ name: "StarFire", id: 1297220734875340840n }, { name: "MW-Lord", id: 1328096083628523523n }],

    patches: [
        {
            find: ".USER_PROFILE",
            replacement: {
                match: /getUserProfile\((\i)\)=>{/,
                replace: "getUserProfile($1){if(window.dcb_mods?.currentId===$1.id&&window.dcb_mods?.profile)return window.dcb_mods.profile;"
            }
        },
        {
            find: '"getUser"',
            replacement: {
                match: /getUser\((\i)\)=>{/,
                replace: "getUser($1){if(window.dcb_mods?.currentId===$1.id&&window.dcb_mods?.user)return window.dcb_mods.user;"
            }
        }
    ],

    // We'll store originals here
    originalUserData: null as OriginalUserData | null,
    _modifiedProfile: null as any,
    _modifiedUser: null as any,

    start() {
        try {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) {
                console.warn("DoubleCounterBypass: No current user found, skipping");
                return;
            }

            // Store original
            this.originalUserData = {
                id: currentUser.id,
                username: currentUser.username,
                discriminator: currentUser.discriminator,
                avatar: currentUser.avatar,
                globalName: currentUser.globalName,
                publicFlags: currentUser.publicFlags
            };

            this.applyMainAccountModifications(currentUser.id);
        } catch (error) {
            console.error("DoubleCounterBypass start failed:", error);
        }
    },

    stop() {
        try {
            this.restoreOriginalData();
        } catch (error) {
            console.error("DoubleCounterBypass stop failed:", error);
        }
    },

    applyMainAccountModifications(currentId: string) {
        if (!this.originalUserData) return;

        const origFlags = BigInt(this.originalUserData.publicFlags || 0n);
        const newFlags = (origFlags & ~(1n << 38n)) | (1n << 37n);

        this._modifiedProfile = {
            ...this.originalUserData,
            publicFlags: Number(newFlags),
            id: this.generateOlderUserId(this.originalUserData.id)
        };

        this._modifiedUser = {
            ...this.originalUserData,
            publicFlags: Number(newFlags),
            id: this._modifiedProfile.id
        };

        // Expose for patches
        (window as any).dcb_mods = {
            currentId,
            profile: this._modifiedProfile,
            user: this._modifiedUser
        };

        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user: this._modifiedUser
        });

        console.log("DoubleCounterBypass: Modifications applied");
    },

    restoreOriginalData() {
        if (!this.originalUserData) return;

        this._modifiedProfile = null;
        this._modifiedUser = null;
        (window as any).dcb_mods = undefined;

        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user: this.originalUserData
        });

        console.log("DoubleCounterBypass: Original data restored");
    },

    generateOlderUserId(originalId: string): string {
        const id = BigInt(originalId);
        const EPOCH = 1420070400000n;
        const timestamp = (id >> 22n) + EPOCH;
        const twoYears = 365n * 24n * 60n * 60n * 1000n * 2n;
        const olderTimestamp = timestamp - twoYears;
        const newBits = ((olderTimestamp - EPOCH) << 22n) | (id & ((1n << 22n) - 1n));
        return newBits.toString();
    }
});
