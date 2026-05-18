import { Router } from "express";
import { verifyAdmin } from "../middleware/adminAuth.js";
import { listDrivers, getDriver, createDriver, updateDriver, removeDriver } from "../services/driverRepo.js";

const router = Router();

router.use(verifyAdmin);

router.get("/", async (_req, res) => {
  res.json(await listDrivers());
});

router.get("/:id", async (req, res) => {
  const driver = await getDriver(req.params.id);
  if (!driver) return res.status(404).json({ error: "not found" });
  res.json(driver);
});

router.post("/", async (req, res) => {
  const { name, phone, vehicleMake, vehicleColor, vehiclePlate, vehicleYear } = req.body || {};
  if (!name || !phone || !vehicleMake || !vehicleColor || !vehiclePlate) {
    return res.status(400).json({ error: "name, phone, vehicleMake, vehicleColor, vehiclePlate required" });
  }
  const driver = await createDriver({ name, phone, vehicleMake, vehicleColor, vehiclePlate, vehicleYear: vehicleYear || null });
  res.json(driver);
});

router.patch("/:id", async (req, res) => {
  const { name, phone, vehicleMake, vehicleColor, vehiclePlate, vehicleYear } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name;
  if (phone !== undefined) data.phone = phone;
  if (vehicleMake !== undefined) data.vehicleMake = vehicleMake;
  if (vehicleColor !== undefined) data.vehicleColor = vehicleColor;
  if (vehiclePlate !== undefined) data.vehiclePlate = vehiclePlate;
  if (vehicleYear !== undefined) data.vehicleYear = vehicleYear;
  const driver = await updateDriver(req.params.id, data);
  if (!driver) return res.status(404).json({ error: "not found" });
  res.json(driver);
});

router.delete("/:id", async (req, res) => {
  await removeDriver(req.params.id);
  res.json({ ok: true });
});

export default router;