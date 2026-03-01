import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { me, updateAvatar } from "../controllers/profileController.js";

const router = express.Router();
router.use(requireAuth);

router.get("/me", asyncHandler(me));
router.patch("/avatar", asyncHandler(updateAvatar));

export default router;
