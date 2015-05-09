import APIClient from "./apiclient";
import {getId, getDuration, getPoints, getYoutubeId} from "./data/topic-tree-helper";
import _ from "underscore";
import Util from "./util";

const userInfoLocalStorageName = "userInfo-3";

export const signIn = () => APIClient.signIn();
export const signOut = (editUser) => {
    localStorage.removeItem(userInfoLocalStorageName);

    editUser((user) => user.merge({
        userInfo: null,
        startedEntities: [],
        completedEntities: [],
    }));

    return APIClient.signOut();
};

export const isSignedIn = () =>
    APIClient.isSignedIn();

const getLocalStorageName = (base, userInfo) =>
    base + "-uid-" + (userInfo.get("nickname") || userInfo.get("username"));

const completedEntitiesLocalStorageName = _.partial(getLocalStorageName, "completed");
const startedEntitiesLocalStorageName= _.partial(getLocalStorageName, "started");
const userVideosLocalStorageName = _.partial(getLocalStorageName, "userVideos");
const userExercisesLocalStorageName = _.partial(getLocalStorageName, "userExercises");

const saveUserInfo = (userInfo) => {
    localStorage.removeItem(userInfoLocalStorageName);
    localStorage.setItem(userInfoLocalStorageName, JSON.stringify(userInfo));
};

const saveStarted = (userInfo, startedEntityIds) => {
    localStorage.removeItem(startedEntitiesLocalStorageName(userInfo));
    localStorage.setItem(startedEntitiesLocalStorageName(userInfo), JSON.stringify(startedEntityIds));
};

const saveCompleted = (userInfo, completedEntityIds) => {
    localStorage.removeItem(completedEntitiesLocalStorageName(userInfo));
    localStorage.setItem(completedEntitiesLocalStorageName(userInfo), JSON.stringify(completedEntityIds));
};

const saveUserVideos = (userInfo, userVideos) => {
    userVideos = userVideos.map((userVideo) => {
        return {
            duration: userVideo.duration,
            last_second_watched: userVideo.last_second_watched,
            points: userVideo.points,
            video: {
                id: userVideo.id
            }
        };
    });
    localStorage.removeItem(userVideosLocalStorageName(userInfo));
    localStorage.setItem(userVideosLocalStorageName(userInfo), JSON.stringify(userVideos));
};

const saveUserExercises = (userInfo, userExercises) => {
    userExercises = userExercises.map((exercise) => {
        return {
            streak: exercise.streak,
            total_correct: exercise.total_correct,
            total_done: exercise.total_done,
            exercise_model: {
                content_id: exercise.exercise_model.content_id
            }
        };
    });

    // The extra removeItem calls before the setItem calls help in case local storage is almost full
    localStorage.removeItem(userExercisesLocalStorageName(userInfo));
    localStorage.setItem(userExercisesLocalStorageName(userInfo), JSON.stringify(userExercises));
};

const loadLocalStorageData = (userInfo) => {
    var result = {};
    var completedEntityIds = localStorage.getItem(completedEntitiesLocalStorageName(userInfo));
    if (completedEntityIds) {
        result.completedEntityIds = JSON.parse(completedEntityIds);
    }
    var startedEntityIds = localStorage.getItem(startedEntitiesLocalStorageName(userInfo));
    if (startedEntityIds) {
        result.startedEntityIds = JSON.parse(startedEntityIds);
    }
    var userVideos = localStorage.getItem(userVideosLocalStorageName(userInfo));
    if (userVideos) {
        result.userVideos = JSON.parse(userVideos);
    }
    var userExercises = localStorage.getItem(userExercisesLocalStorageName(userInfo));
    if (userExercises) {
        result.userExercises = JSON.parse(userExercises);
    }

    return result;
};


export const reportVideoProgress = (user, topicTreeCursor, editVideo, secondsWatched, lastSecondWatched) => {
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
                // var userInfo = CurrentUser.get("userInfo");
                // userInfo.points += result.points_earned;
                saveUserInfo(user.get("userInfo"));
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

            saveStarted(user.get("userInfo"), user.get("startedEntities"));
            saveCompleted(user.get("userInfo"), user.get("completedEntities"));
            saveUserVideos(user.get("userInfo"), user.get("userVideos"));
            saveUserExercises(user.get("userInfo"), user.get("userExercises"));

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


export const refreshLoggedInInfo = (user, editUser, forceRefreshAllInfo) => {
    return new Promise((resolve, reject) => {
        if (!isSignedIn()) {
            return resolve();
        }

        // Get the user profile info
        APIClient.getUserInfo().then((result) => {
            Util.log("getUserInfo: %o", result);
            const userInfo = {
                avatarUrl: result.avatar_url,
                joined: result.joined,
                nickname: result.nickname,
                username: result.username,
                points: result.points,
                badgeCounts: result.badge_counts
            };
            editUser((user) => user.merge({
                userInfo,
            }));

            saveUserInfo(userInfo);

            var result = loadLocalStorageData(user.get("userInfo"));
            if (!forceRefreshAllInfo && result) {
                Util.log("User info only obtained. Not obtaining user data because we have it cached already!");
                return result;
            }

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

            // Save to local storage
            saveStarted(user.get("userInfo"), startedEntityIds);
            saveCompleted(user.get("userInfo"), completedEntityIds);
            return APIClient.getUserVideos();
        }).then((userVideosResults) => {
            saveUserVideos(user.get("userInfo"), userVideosResults);
            return APIClient.getUserExercises();
        }).then((userExercisesResults) => {
            saveUserExercises(user.get("userInfo"), userExercisesResults);
            resolve();
        }).catch(() => {
            reject();
        });
    });
};

