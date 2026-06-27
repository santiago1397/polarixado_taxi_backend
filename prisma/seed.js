import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/services/authService.js";
import { getDriver } from "../src/services/driverRepo.js";
import {
  DEFAULT_VEHICLE_TIERS,
  DEFAULT_NAMED_PLACES,
  DEFAULT_ZONES,
  DEFAULT_TIME_OF_DAY_SURCHARGE,
  DEFAULT_CROSSING_RULES,
} from "../src/config/defaultTiers.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    console.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping seed");
    return;
  }

  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (existingAdmin) {
    console.log("Admin already exists, skipping.");
  } else {
    const passwordHash = await hashPassword(password);
    const admin = await prisma.admin.create({
      data: { email, passwordHash, name, role: "SUPER_ADMIN" },
    });
    console.log(`Created SUPER_ADMIN: ${admin.email}`);
  }

  await prisma.config.upsert({
    where: { id: "singleton" },
    update: {
      vehicleTiers: DEFAULT_VEHICLE_TIERS,
      namedPlaces: DEFAULT_NAMED_PLACES,
      zones: DEFAULT_ZONES,
      timeOfDaySurcharge: DEFAULT_TIME_OF_DAY_SURCHARGE,
      crossingRules: DEFAULT_CROSSING_RULES,
    },
    create: {
      id: "singleton",
      vehicleTiers: DEFAULT_VEHICLE_TIERS,
      currency: process.env.CURRENCY || "USD",
      zelleHandle: process.env.ZELLE_HANDLE || null,
      zelleName: process.env.ZELLE_NAME || null,
      namedPlaces: DEFAULT_NAMED_PLACES,
      zones: DEFAULT_ZONES,
      timeOfDaySurcharge: DEFAULT_TIME_OF_DAY_SURCHARGE,
      crossingRules: DEFAULT_CROSSING_RULES,
    },
  });
  console.log("Config singleton ensured.");

  const driverCount = await prisma.driver.count();
  if (driverCount === 0) {
    await prisma.driver.create({
      data: { name: "Carlos M.", phone: "5804126080650", email: "santiagovillahermosa@gmail.com", vehicleMake: "Toyota Camry", vehicleColor: "Silver", vehiclePlate: "NJ T45-XPQ", vehicleYear: 2021 },
    });
    console.log("Seeded 1 driver.");
  }

  const dealCount = await prisma.deal.count();
  if (dealCount > 0) {
    console.log(`${dealCount} deals already exist, skipping seed.`);
  } else {
    const now = new Date();
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + (6 - now.getDay())); // next Saturday
    saturday.setHours(19, 0, 0, 0);

    const sunday = new Date(saturday);
    sunday.setHours(23, 0, 0, 0);

    const nextSaturday2 = new Date(saturday);
    nextSaturday2.setDate(saturday.getDate() + 7);

    const nextSunday2 = new Date(nextSaturday2);
    nextSunday2.setHours(23, 0, 0, 0);

    const airports = [
      { lat: 40.6413, lng: -73.7781, name: "JFK Airport" },
      { lat: 40.7769, lng: -73.8740, name: "LaGuardia Airport" },
    ];
    const venues = [
      { lat: 40.7580, lng: -73.9855, name: "Times Square, New York, NY" },
      { lat: 40.7527, lng: -73.9772, name: "Grand Central Terminal, New York, NY" },
      { lat: 40.8296, lng: -73.9262, name: "Yankee Stadium, Bronx, NY" },
    ];

    const deals = [
      {
        title: "Saturday Night in Manhattan",
        description: "Explore Times Square, Broadway shows, and the city's best nightlife. Return at midnight.",
        imageUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&q=80",
        destination: "Times Square, New York, NY",
        destLat: 40.7580,
        destLng: -73.9855,
        price: 180,
        passengerCount: 6,
        departureAt: saturday.toISOString(),
        returnAt: sunday.toISOString(),
        vehicleType: "UBER_XL",
        active: true,
      },
      {
        title: "JFK Airport Run",
        description: "Reliable group transport to JFK. Perfect for early flights.",
        imageUrl: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80",
        destination: "John F. Kennedy International Airport, Queens, NY",
        destLat: 40.6413,
        destLng: -73.7781,
        price: 120,
        passengerCount: 4,
        departureAt: nextSaturday2.toISOString(),
        returnAt: nextSunday2.toISOString(),
        vehicleType: "UBER_XL",
        active: true,
      },
      {
        title: "Broadway Night Out",
        description: "Catch a show and enjoy dinner in the city. Return after the performance.",
        imageUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35?w=800&q=80",
        destination: "Broadway Theater District, New York, NY",
        destLat: 40.7580,
        destLng: -73.9855,
        price: 160,
        passengerCount: 4,
        departureAt: new Date(nextSaturday2.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        returnAt: new Date(nextSunday2.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        vehicleType: "UBER_X",
        active: true,
      },
      {
        title: "Yankee Game Day",
        description: "Root for the Bronx Bombers with your group. Round-trip to the stadium.",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Yankee_Stadium_upper_deck_2010.jpg/960px-Yankee_Stadium_upper_deck_2010.jpg",
        destination: "Yankee Stadium, Bronx, NY",
        destLat: 40.8296,
        destLng: -73.9262,
        price: 140,
        passengerCount: 6,
        departureAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        returnAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
        vehicleType: "UBER_XL",
        active: true,
      },
      {
        title: "LaGuardia Transfers",
        description: "Comfortable group transfer to LaGuardia. Fixed price, no surprises.",
        imageUrl: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80",
        destination: "LaGuardia Airport, Queens, NY",
        destLat: 40.7769,
        destLng: -73.8740,
        price: 110,
        passengerCount: 4,
        departureAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        returnAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
        vehicleType: "UBER_X",
        active: true,
      },
    ];

    for (const deal of deals) {
      await prisma.deal.create({ data: deal });
    }
    console.log(`Seeded ${deals.length} example deals.`);
  }
}

main().finally(() => prisma.$disconnect());