import { Router } from "express";
import { verifyAdmin } from "../middleware/adminAuth.js";
import { listDeals, getDeal, createDeal, updateDeal, deleteDeal } from "../services/dealRepo.js";

const router = Router();

// Public
router.get("/", async (_req, res) => {
  res.json(await listDeals());
});

router.get("/:id", async (req, res) => {
  const deal = await getDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: "not found" });
  res.json(deal);
});

// Admin-only
router.post("/", verifyAdmin, async (req, res) => {
  const data = req.body || {};
  const required = ["title", "destination", "destLat", "destLng", "price", "passengerCount", "departureAt", "returnAt"];
  for (const field of required) {
    if (data[field] === undefined) return res.status(400).json({ error: `${field} required` });
  }
  const deal = await createDeal({
    title: data.title,
    description: data.description || null,
    imageUrl: data.imageUrl || null,
    destination: data.destination,
    destLat: data.destLat,
    destLng: data.destLng,
    price: data.price,
    currency: data.currency || "USD",
    passengerCount: data.passengerCount,
    departureAt: new Date(data.departureAt),
    returnAt: new Date(data.returnAt),
    vehicleType: data.vehicleType || "UBER_XL",
    active: data.active !== undefined ? data.active : true,
  });
  res.json(deal);
});

router.patch("/:id", verifyAdmin, async (req, res) => {
  const data = req.body || {};
  const updateData = {};
  const fields = ["title", "description", "imageUrl", "destination", "destLat", "destLng", "price", "currency", "passengerCount", "departureAt", "returnAt", "vehicleType", "active"];
  for (const field of fields) {
    if (data[field] !== undefined) {
      if (field === "departureAt" || field === "returnAt") {
        updateData[field] = new Date(data[field]);
      } else {
        updateData[field] = data[field];
      }
    }
  }
  const deal = await updateDeal(req.params.id, updateData);
  if (!deal) return res.status(404).json({ error: "not found" });
  res.json(deal);
});

router.delete("/:id", verifyAdmin, async (req, res) => {
  const deal = await deleteDeal(req.params.id);
  if (!deal) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;