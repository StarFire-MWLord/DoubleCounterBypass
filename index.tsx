import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";
import { UserStore } from "@webpack/common";

export default definePlugin({
    name: "DoubleCounterBypass",
    description: "Makes Double Counter think your alt account is your main account",
    authors: [{ name: "Anonymous", id: 0n }],
    
    settingsAboutComponent: () => null,
    
    patches: [
        {
            find: ".USER_PROFILE",
            replacement: {
                match: /getUserProfile\((\i)\)=>{/,
                replace: "getUserProfile($1){if($1.id===UserStore.getCurrentUser().id&&UserStore.__dcb_profile)return UserStore.__dcb_profile;"
            }
        },
        {
            find: '"getUser"',
            replacement: {
                match: /getUser\((\i)\)=>{/,
                replace: "getUser($1){if($1.id===UserStore.getCurrentUser().id&&UserStore.__dcb_user)return UserStore.__dcb_user;"
            }
        }
    ],

    start() {
        try {
            const currentUser = UserStore.getCurrentUser();
            if (!currentUser) {
                console.warn("DoubleCounterBypass: No current user, skipping start");
                return;
            }
            
            // Store the original user data (shallow copy select fields)
            this.originalUserData = {
                id: currentUser.id,
                username: currentUser.username,
                discriminator: currentUser.discriminator,
                avatar: currentUser.avatar,
                globalName: currentUser.globalName,
                publicFlags: currentUser.publicFlags
            };
            
            // Apply modifications
            this.applyMainAccountModifications();
        } catch (error) {
            console.error("DoubleCounterBypass failed to start:", error);
        }
    },
    
    stop() {
        try {
            this.restoreOriginalData();
        } catch (error) {
            console.error("DoubleCounterBypass failed to stop:", error);
        }
    },
    
    applyMainAccountModifications() {
        const origFlags = BigInt(this.originalUserData.publicFlags || 0n);
        // Remove VERIFIED_BOT (1<<38), add EARLY_VERIFIED_BOT_DEVELOPER (1<<37)
        const newFlags = (origFlags & ~(1n << 38n)) | (1n << 37n);
        
        // Create modified profile data
        this._modifiedProfile = {
            ...this.originalUserData,
            publicFlags: Number(newFlags),
            id: this.generateOlderUserId(this.originalUserData.id)
        };
        
        // Create modified user data
        this._modifiedUser = {
            ...this.originalUserData,
            publicFlags: Number(newFlags),
            id: this._modifiedProfile.id
        };
        
        // Store on UserStore for patches to access
        UserStore.__dcb_profile = this._modifiedProfile;
        UserStore.__dcb_user = this._modifiedUser;
        
        // Force Discord to refresh user data
        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user: this._modifiedUser
        });
    },
    
    restoreOriginalData() {
        if (!this.originalUserData) return;
        
        // Clear modified data
        this._modifiedProfile = null;
        this._modifiedUser = null;
        delete UserStore.__dcb_profile;
        delete UserStore.__dcb_user;
        
        // Force Discord to refresh with original data
        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user: this.originalUserData
        });
    },
    
    generateOlderUserId(originalId) {
        const id = BigInt(originalId);
        const DISCORD_EPOCH = 1420070400000n;
        const timestamp = (id >> 22n) + DISCORD_EPOCH;
        const twoYearsMs = 365n * 24n * 60n * 60n * 1000n * 2n;
        const olderTimestamp = timestamp - twoYearsMs;
        const newTimestampBits = (olderTimestamp - DISCORD_EPOCH) << 22n;
        const workerData = id & ((1n << 22n) - 1n);
        const newSnowflake = newTimestampBits | workerData;
        return newSnowflake.toString();
    }
});