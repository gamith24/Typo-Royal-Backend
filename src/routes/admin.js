import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  broadcastMessage,
  createEventBanner,
  createMode,
  createQuizQuestion,
  createTest,
  listPlayers,
  listTests,
  overview,
  playerDetail,
  removeEventBanner,
  setEventBannerActive,
  sendDirectMessage,
  updateEventBanner
} from "../controllers/adminController.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/overview", asyncHandler(overview));
router.post("/modes", asyncHandler(createMode));
router.post("/tests", asyncHandler(createTest));
router.get("/tests", asyncHandler(listTests));
router.post("/tests/:testId/questions", asyncHandler(createQuizQuestion));
router.get("/players", asyncHandler(listPlayers));
router.get("/players/:userId", asyncHandler(playerDetail));
router.post("/messages/direct", asyncHandler(sendDirectMessage));
router.post("/messages/broadcast", asyncHandler(broadcastMessage));
router.post("/events/banners", asyncHandler(createEventBanner));
router.patch("/events/banners/:bannerId", asyncHandler(updateEventBanner));
router.patch("/events/banners/:bannerId/active", asyncHandler(setEventBannerActive));
router.delete("/events/banners/:bannerId", asyncHandler(removeEventBanner));

export default router;
