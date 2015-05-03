import APIClient from "./apiclient";
import {getId, getDuration, getPoints, getYoutubeId} from "./data/topic-tree-helper";
import _ from "underscore";

const userInfoLocalStorageName = "userInfo-3";

export const signIn = () => APIClient.signIn();
export const signOut = () => {
    // Unbind user specific data from the topic tree
    // TODO
    /*
    this._syncStartedToTopicTree(false);
    this._syncCompletedToTopicTree(false);
    this._syncUserVideoProgressToTopicTree(false);
    this._syncUserExerciseProgressToTopicTree(false);

    // Remove userInfo from the model and clear its local storage
    this.unset("userInfo");
    */
    localStorage.removeItem(userInfoLocalStorageName);
    return APIClient.signOut();
};

export const isSignedIn = () =>
    APIClient.isSignedIn();

export const reportVideoProgress = (topicTreeCursor, editVideo, secondsWatched, lastSecondWatched) => {
    return new Promise((resolve, reject) => {
        var youTubeId = getYoutubeId(topicTreeCursor);
        var videoId = getId(topicTreeCursor);
        var duration = getDuration(topicTreeCursor);
        APIClient.reportVideoProgress(videoId, youTubeId, duration, secondsWatched, lastSecondWatched).then((result) => {
            if (!result) {
                Util.warn("Video progress report returned null results!");
                return;
            }
            Util.log("reportVideoProgress result: %o", result);

            var lastPoints = getPoints(topicTreeCursor);
            var newPoints = lastPoints + result.points_earned;
            if (newPoints > 750) {
                newPoints = 750;
            }

            // If they've watched some part of the video, and it's not almost the end
            // Otherwise check if we already have video progress for this item and we
            // therefore no longer need it.
            var lastSecondWatched;
            if (result.last_second_watched > 10 &&
                    duration - result.last_second_watched > 10) {
                lastSecondWatched = result.last_second_watched;
            }

            // If we're just getting a completion of a video update
            // the user's overall points locally.
            if (result.points_earned > 0) {
                // TODO: It would be better to store userInfo properties directly
                // That way notificaitons will go out automatically.
                var userInfo = CurrentUser.get("userInfo");
                userInfo.points += result.points_earned;
                CurrentUser._saveUserInfo();
            }

            editVideo((video) =>
                video.merge({
                    points: newPoints,
                    completed: result.is_video_completed,
                    started: !result.is_video_completed,
                    lastSecondWatched: lastSecondWatched
                }));

            // Update locally stored cached info
            var index;
            if (result.is_video_completed) {
                index = this.get("startedEntityIds").indexOf(getId(topicTreeCursor));
                if (index !== -1) {
                    this.get("startedEntityIds").splice(index, 1);
                }
                index = this.get("completedEntityIds").indexOf(getId(topicTreeCursor));
                if (index === -1) {
                    this.get("completedEntityIds").push(getId(topicTreeCursor));
                }
            } else {
                index = this.get("startedEntityIds").indexOf(getId(topicTreeCursor));
                if (index === -1) {
                    this.get("startedEntityIds").push(getId(topicTreeCursor));
                }
            }

            var foundUserVideo = _(this.get("userVideos")).find((info) => {
                info.video.id === getId(topicTreeCursor);
            });
            var isNew = !foundUserVideo;
            foundUserVideo = foundUserVideo || {
                video: {
                    id: getId(topicTreeNode)
                },
                duration: getDuration(topicTreeNode)
            };
            foundUserVideo["points"] = newPoints;
            foundUserVideo["last_second_watched"] = lastSecondWatched;
            if (isNew) {
                this.get("userVideos").push(foundUserVideo);
            }

            this._saveStarted();
            this._saveCompleted();
            this._saveUserVideos();
            this._saveUserExercises();

            resolve({
                completed: result.is_video_completed,
                lastSecondWatched: result.last_second_watched,
                pointsEarned: result.points_earned,
                youtubeId: result.youtube_id,
                videoId: videoId,
                id: getId(topicTreeCursor)
            });
        }).catch(() => {
            reject();
        });
    });
};


export const refreshLoggedInInfo = (editUser, forceRefreshAllInfo) => {
    return new Promise((resolve, reject) => {
        if (!isSignedIn()) {
            return resolve();
        }

        // Get the user profile info
        APIClient.getUserInfo().then((result) => {
            Util.log("getUserInfo: %o", result);
            editUser((user) => user.merge({
                userInfo: {
                    avatarUrl: result.avatar_url,
                    joined: result.joined,
                    nickname: result.nickname,
                    username: result.username,
                    points: result.points,
                    badgeCounts: result.badge_counts
                },
            }));

            // TODO
            /*this._saveUserInfo();

            if (!forceRefreshAllInfo && this._loadLocalStorageData()) {
                Util.log("User info only obtained. Not obtaining user data because we have it cached already!");
                return;
            }
            */

            // The call is needed for completed/in progress status of content items
            // Unlike getUserVideos, this includes both articles and videos.
            return APIClient.getUserProgress();

        }).then((data) => {
            Util.log("getUserProgress: %o", data);
            // Get rid of the 'a' and 'v' prefixes, and set the completed / started
            // attributes accordingly.
            const startedEntityIds = _.map(data.started, function(e) {
                return e.substring(1);
            });
            const completedEntityIds = _.map(data.complete, function(e) {
                return e.substring(1);
            });

            editUser((user) => user.merge({
                startedEntities: startedEntityIds,
                completedEntities: completedEntityIds,
            }));

            // Update topic tree models
            // TODO
            /*
            this._syncStartedToTopicTree(true);
            this._syncCompletedToTopicTree(true);

            // Save to local storage
            this._saveStarted();
            this._saveCompleted();
            */

            return APIClient.getUserVideos();
        }).then((userVideosResults) => {
            // The call is needed for the last second watched and points of each watched item.
            // TODO
            /*
            this.set("userVideos", userVideosResults);
            this._syncUserVideoProgressToTopicTree(true);
            this._saveUserVideos();
            */

            return APIClient.getUserExercises();
        }).then((userExercisesResults) => {
            // TODO
            /*
            this.set("userExercises", userExercisesResults);
            this._syncUserExerciseProgressToTopicTree(true);
            this._saveUserExercises();
            */
            resolve();
        }).catch(() => {
            reject();
        });
    });
};

