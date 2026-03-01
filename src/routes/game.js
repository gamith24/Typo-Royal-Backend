import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  addFriend,
  banners,
  conversationMessages,
  createGroupConversation,
  createPrivateConversation,
  getMatchSession,
  friends,
  home,
  leaderboard,
  listConversations,
  listFriendRequests,
  modes,
  news,
  notifications,
  publicProfile,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest
} from "../controllers/gameController.js";

const router = express.Router();
router.use(requireAuth);

router.get("/home", asyncHandler(home));
router.get("/modes", asyncHandler(modes));
router.get("/leaderboard/:bucket", asyncHandler(leaderboard));
router.get("/friends", asyncHandler(friends));
router.post("/friends/:friendId", asyncHandler(addFriend));
router.get("/players/search", asyncHandler(searchPlayers));
router.post("/friends/request/:userId", asyncHandler(sendFriendRequest));
router.get("/friends/requests", asyncHandler(listFriendRequests));
router.post("/friends/requests/:requestId/:action", asyncHandler(respondFriendRequest));
router.get("/notifications", asyncHandler(notifications));
router.get("/news", asyncHandler(news));
router.get("/banners", asyncHandler(banners));
router.get("/matches/:matchId", asyncHandler(getMatchSession));
router.get("/profiles/:userId", asyncHandler(publicProfile));
router.get("/messages/conversations", asyncHandler(listConversations));
router.post("/messages/conversations/private/:userId", asyncHandler(createPrivateConversation));
router.post("/messages/conversations/group", asyncHandler(createGroupConversation));
router.get("/messages/conversations/:conversationId/messages", asyncHandler(conversationMessages));

export default router;
