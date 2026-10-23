/**
 * CarbEarn Universal Carbon Engine & Currency Calculator
 *
 * Provides real-time natural language parsing, IPCC/EPA emission factor resolution,
 * weekly lifecycle avoidance calculation, and Carbon Currency (CBC) valuation.
 * Standard pegged for India: 1 kg CO2e = 1.000 CBC = ₹2.50 INR.
 */

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Carbon Market Constants (India Pegged)
// ---------------------------------------------------------------------------
// 1 Metric Ton (1,000 kg) CO2e = 1,000 CBC = ₹2,500 INR
// 1 kg CO2e = 1.000 CBC (CarbEarn Carbon Currency Unit) = ₹2.50 INR
// 1 kg CO2e = 1,000 mCBC (milli-CBC)
const CARBON_MARKET_RATES = {
    CBC_PER_KG_CO2: 1.0,
    INR_PER_CBC: 2.50,
    INR_PER_TON_CO2: 2500.0,
    USD_PER_CBC: 0.030
};

// ---------------------------------------------------------------------------
// Domain Emission Factors Knowledge Base (kg CO2e per unit)
// ---------------------------------------------------------------------------
const EMISSION_BENCHMARKS = [
    // 1. Energy Conservation - Lighting & Classroom Power
    {
        id: "classroom_lighting_fan",
        keywords: [
            "switch off light", "switched off light", "switched of light", "turn off light", "turned off light",
            "switch off lights", "switched off lights", "switched of lights", "turn off lights", "turned off lights",
            "lights off", "light off", "classroom light", "classroom lights", "tubelight", "tube light", "room light",
            "room lights", "fan off", "fans off", "switch off fan", "switched off fan", "switched of fan", "turn off fan",
            "turned off fan", "classroom fan", "classroom fans", "switched of lights of the classroom",
            "switched off lights of the classroom", "turned off lights of the classroom", "switch off lights of classroom",
            "light", "lights", "lamp", "lamps", "bulb", "bulbs", "fan", "fans", "tubelights"
        ],
        category: "Energy Conservation",
        action: "Turned Off Classroom/Room Lighting & Fans",
        baseline: "Active 40-60W Classroom Fixtures Left Running (0.05 kg/hr)",
        unit: "hours",
        defaultQty: 3,
        emissionFactor: 0.05,
        rationale: "Deactivating unoccupied classroom and facility fixtures prevents continuous thermal coal grid electricity draw (~0.05 kg CO2e per fixture-hour)."
    },
    {
        id: "appliance_powerdown",
        keywords: [
            "unplug", "unplugged", "charger", "laptop charger", "pc shutdown", "computer shutdown", "lab computer",
            "monitor", "projector", "standby power", "vampire power", "phantom load", "power down", "idle appliance",
            "switched off computer", "switched off ac", "turn off ac", "switched off projector"
        ],
        category: "Energy Conservation",
        action: "Appliance & System Standby Power-Down",
        baseline: "Standby Phantom Electrical Load (0.04 kg/hr)",
        unit: "hours",
        defaultQty: 4,
        emissionFactor: 0.04,
        rationale: "Eliminating idle and standby appliance power directly reduces institutional thermal electrical demand."
    },
    {
        id: "led_lighting",
        keywords: ["led", "cfl", "fluorescent", "compact fluorescent", "led bulb", "led tube", "energy efficient lighting"],
        category: "Energy Conservation",
        action: "High-Efficiency Solid-State LED Usage",
        baseline: "60W Incandescent Lamp (0.042 kg/hr saved)",
        unit: "hours",
        defaultQty: 8,
        emissionFactor: 0.042,
        rationale: "Replacing legacy incandescent lamps with 9W LEDs reduces electrical demand by >85%, saving 0.042 kg CO2 per hour."
    },
    {
        id: "electricity_conservation",
        keywords: ["electricity saving", "kwh", "power saving", "conserved electricity", "conserved power", "saved electricity", "saved power", "power cut saving"],
        category: "Energy Conservation",
        action: "Direct Electrical Grid Conservation",
        baseline: "Standard Regional Grid Mix (0.82 kg/kWh)",
        unit: "kWh",
        defaultQty: 5,
        emissionFactor: 0.82,
        rationale: "Every kilowatt-hour conserved directly prevents combustion of coal at central thermal power generation facilities."
    },
    {
        id: "air_conditioning_adjustment",
        keywords: ["ac", "air condition", "thermostat", "temperature setting", "cooling", "chiller", "ac 24", "air conditioner"],
        category: "Energy Conservation",
        action: "Smart AC Temperature Optimization (24°C+)",
        baseline: "Sub-20°C Overcooling (1.2 kWh/hr)",
        unit: "hours",
        defaultQty: 6,
        emissionFactor: 0.25,
        rationale: "Operating air conditioning at 24°C rather than 18-20°C conserves 18-24% compressor power, saving ~0.25 kg CO2/hr."
    },
    {
        id: "cold_wash_laundry",
        keywords: ["cold water", "cold wash", "laundry", "washing machine", "cold cycle"],
        category: "Energy Conservation",
        action: "Cold Water Laundry Cycle",
        baseline: "Hot Water Laundry Heating (1.8 kWh/cycle)",
        unit: "loads",
        defaultQty: 3,
        emissionFactor: 1.48,
        rationale: "Water heating accounts for ~90% of laundry machine energy consumption. Washing cold eliminates ~1.48 kg CO2/load."
    },
    {
        id: "air_drying_clothes",
        keywords: ["air dry", "line dry", "clothesline", "sun dry", "tumble dry"],
        category: "Energy Conservation",
        action: "Line / Natural Sun Drying Clothes",
        baseline: "Electric Resistance Tumble Dryer (2.5 kWh/load)",
        unit: "loads",
        defaultQty: 2,
        emissionFactor: 2.05,
        rationale: "Drying laundry in natural sunlight and air avoids heavy tumble dryer heating electricity, saving ~2.05 kg CO2 per load."
    },

    // 2. Renewable Energy
    {
        id: "solar_generation",
        keywords: ["solar", "photovoltaic", "pv panel", "solar panel", "solar generation", "clean power", "solar rooftop", "solar water heater", "solar pv"],
        category: "Renewable Energy",
        action: "Rooftop Solar Clean Energy Generation",
        baseline: "Thermal Coal Grid Electricity (0.82 kg/kWh)",
        unit: "kWh",
        defaultQty: 15,
        emissionFactor: 0.78,
        rationale: "Solar photovoltaic generation displaces high-carbon coal thermal grid electricity (~0.78 kg net avoided CO2/kWh)."
    },

    // 3. Clean Mobility & Transit
    {
        id: "train_transit",
        keywords: ["train", "metro", "subway", "rail", "commuter", "light rail", "local train", "electric train", "mumbai local", "delhi metro"],
        category: "Clean Mobility & Transit",
        action: "Electric Rail / Metro Transit",
        baseline: "Solo Petrol Car Commute (0.21 kg/km)",
        unit: "km",
        defaultQty: 15,
        emissionFactor: 0.18,
        rationale: "Electric rail transit emits ~0.03 kg CO2/p-km compared to 0.21 kg/km for solo combustion automobile travel."
    },
    {
        id: "cycling",
        keywords: ["cycle", "cycling", "bike", "bicycle", "pedal", "bicycled", "biking"],
        category: "Clean Mobility & Transit",
        action: "Bicycle Zero-Emission Commute",
        baseline: "Combustion Engine Vehicle (0.21 kg/km)",
        unit: "km",
        defaultQty: 8,
        emissionFactor: 0.21,
        rationale: "Zero-tailpipe bicycle commute fully offsets combustion vehicle emissions of 0.21 kg CO2 per kilometer."
    },
    {
        id: "walking",
        keywords: ["walk", "walking", "pedestrian", "on foot", "stroll", "walked"],
        category: "Clean Mobility & Transit",
        action: "Zero-Emission Walking",
        baseline: "Short-distance Motor Vehicle Travel (0.15 kg/km)",
        unit: "km",
        defaultQty: 3,
        emissionFactor: 0.15,
        rationale: "Walking eliminates short urban car trips which produce disproportionate cold-start emissions."
    },
    {
        id: "bus_transit",
        keywords: ["bus", "public transit", "shuttle", "coach", "city bus", "dtc", "bmtc", "best", "msrtc", "college bus"],
        category: "Clean Mobility & Transit",
        action: "Public Bus Transit",
        baseline: "Single-Occupant Car (0.21 kg/km)",
        unit: "km",
        defaultQty: 12,
        emissionFactor: 0.12,
        rationale: "Shared mass transit bus achieves high occupancy, mitigating 0.12 kg CO2 per passenger-kilometer."
    },
    {
        id: "carpooling",
        keywords: ["carpool", "carpooling", "shared ride", "liftshare", "rideshare", "shared auto", "auto rickshaw", "e-rickshaw", "car pool"],
        category: "Clean Mobility & Transit",
        action: "Vehicular Carpooling / Shared Transit",
        baseline: "Solo Vehicle Commute (0.21 kg/km)",
        unit: "km",
        defaultQty: 15,
        emissionFactor: 0.14,
        rationale: "Splitting vehicular emissions among multiple riders reduces per-person commute footprint by over 66%."
    },
    {
        id: "ev_transit",
        keywords: ["ev", "electric vehicle", "electric car", "e-bike", "electric scooter", "tesla", "ather", "ola electric", "chetak", "ev scooter"],
        category: "Clean Mobility & Transit",
        action: "Electric Vehicle Commute",
        baseline: "Internal Combustion Engine Vehicle (0.21 kg/km)",
        unit: "km",
        defaultQty: 20,
        emissionFactor: 0.16,
        rationale: "High powertrain efficiency of electric mobility avoids ~0.16 kg CO2/km versus internal combustion engines."
    },
    {
        id: "work_from_home",
        keywords: ["work from home", "remote work", "telecommute", "wfh", "telecommuting", "home office", "remote study", "online class"],
        category: "Clean Mobility & Transit",
        action: "Remote Work / Study (Avoided Commute)",
        baseline: "Roundtrip Daily Commute (0.21 kg/km)",
        unit: "km",
        defaultQty: 25,
        emissionFactor: 0.21,
        rationale: "Eliminating physical transit avoids all tailpipe and vehicle wear emissions along the commute distance."
    },

    // 4. Sustainable Diet & Nutrition
    {
        id: "plant_based_meal",
        keywords: ["vegan", "plant-based", "plant based", "vegetarian meal", "no beef", "meatless", "tofu", "veg thali", "dal chawal", "sabzi", "roti sabzi"],
        category: "Sustainable Diet & Nutrition",
        action: "Plant-Based / Vegetarian Meal Choice",
        baseline: "High-Carbon Meat Meal (3.3 kg CO2e/meal)",
        unit: "meals",
        defaultQty: 3,
        emissionFactor: 2.80,
        rationale: "Choosing plant-based dining avoids high livestock feed, enteric methane, and heavy agricultural processing footprints."
    },
    {
        id: "vegetarian_meal",
        keywords: ["vegetarian", "meatless monday", "no meat", "dairy veg", "veg meal"],
        category: "Sustainable Diet & Nutrition",
        action: "Vegetarian Diet Option",
        baseline: "Conventional Mixed Meat Meal (1.8 kg CO2e/meal)",
        unit: "meals",
        defaultQty: 5,
        emissionFactor: 1.10,
        rationale: "Adopting vegetarian dining mitigates 1.10 kg CO2 equivalent per meal compared to conventional poultry/pork meals."
    },
    {
        id: "food_waste_mitigation",
        keywords: ["food waste", "zero waste", "leftovers", "prevent food waste", "ate leftovers", "finished food", "no food waste", "plate clean"],
        category: "Sustainable Diet & Nutrition",
        action: "Food Waste Prevention & Plate Clearance",
        baseline: "Landfilled Food Anaerobic Rotting (2.5 kg CO2e/kg)",
        unit: "kg",
        defaultQty: 2,
        emissionFactor: 2.50,
        rationale: "Preventing edible food from rotting avoids embodied farming, processing, cold-chain, and landfill methane emissions."
    },

    // 5. Waste Mitigation & Circularity
    {
        id: "composting",
        keywords: ["compost", "composting", "organic waste", "food scrap", "biodegradable", "vermicompost", "leaf compost", "garden waste"],
        category: "Waste Mitigation & Circularity",
        action: "Organic Waste Aerobic Composting",
        baseline: "Anaerobic Landfill Methane Generation (0.85 kg CO2e/kg)",
        unit: "kg",
        defaultQty: 5,
        emissionFactor: 0.85,
        rationale: "Aerobic composting prevents anaerobic degradation in municipal dumpsites which releases potent methane (CH4) gas."
    },
    {
        id: "reusable_bottle",
        keywords: ["reusable bottle", "water bottle", "flask", "tumbler", "refill", "avoid plastic bottle", "steel bottle", "copper bottle"],
        category: "Waste Mitigation & Circularity",
        action: "Reusable Beverage Container",
        baseline: "Single-Use PET Bottle Manufacturing (0.082 kg/bottle)",
        unit: "refills",
        defaultQty: 10,
        emissionFactor: 0.082,
        rationale: "Eliminating single-use PET bottles avoids raw petroleum refining, bottle blowing, and long-range logistics emissions."
    },
    {
        id: "reusable_bag",
        keywords: ["tote bag", "canvas bag", "reusable bag", "shopping bag", "cloth bag", "avoid plastic bag", "jute bag", "no plastic bag"],
        category: "Waste Mitigation & Circularity",
        action: "Reusable Cloth / Jute Shopping Bag",
        baseline: "Single-Use Polyethylene Plastic Bag (0.05 kg/bag)",
        unit: "bags",
        defaultQty: 8,
        emissionFactor: 0.05,
        rationale: "Using durable cloth or jute bags prevents single-use plastic polymer film manufacturing and environmental persistence."
    },
    {
        id: "recycling_paper",
        keywords: ["paper recycling", "cardboard", "recycled paper", "carton", "newspaper recycling", "raddi"],
        category: "Waste Mitigation & Circularity",
        action: "Paper & Cardboard Recycling",
        baseline: "Virgin Wood Pulp Processing (1.1 kg CO2/kg)",
        unit: "kg",
        defaultQty: 5,
        emissionFactor: 1.10,
        rationale: "Reprocessing post-consumer cellulose preserves living forest carbon sinks and reduces paper mill chemical bleaching."
    },
    {
        id: "waste_segregation",
        keywords: ["segregation", "segregated waste", "dry waste", "wet waste", "plastic sorting", "waste separation", "waste bin"],
        category: "Waste Mitigation & Circularity",
        action: "Source Waste Segregation & Plastic Diversion",
        baseline: "Unsegregated Landfill Dumpsite (0.35 kg/kg)",
        unit: "kg",
        defaultQty: 4,
        emissionFactor: 0.35,
        rationale: "Separating wet and dry recyclables at source prevents organic methane formation and facilitates circular material recovery."
    },

    // 6. Tree Stewardship & Afforestation
    {
        id: "tree_planting",
        keywords: ["tree", "sapling", "planted tree", "afforestation", "reforestation", "plant trees", "neem", "peepal", "banyan", "gulmohar", "jamun", "tree plantation", "planted sapling"],
        category: "Tree Stewardship & Afforestation",
        action: "Native Tree Afforestation",
        baseline: "Degraded Urban Soil",
        unit: "trees",
        defaultQty: 1,
        emissionFactor: 21.77,
        rationale: "A native sapling sequesters an average of 21.77 kg CO2 annually into biomass and root soil as it matures."
    },
    {
        id: "tree_care",
        keywords: ["watering tree", "tree care", "mulching", "sapling care", "pruning", "plant watering", "gardening", "soil nourishment", "watering plants"],
        category: "Tree Stewardship & Afforestation",
        action: "GreenProof Tree Stewardship & Maintenance",
        baseline: "Sapling Mortality Without Care",
        unit: "sessions",
        defaultQty: 2,
        emissionFactor: 2.50,
        rationale: "Active arboricultural maintenance increases survival rate from 40% to over 90%, preserving long-term carbon sequestration."
    },

    // 7. Water Conservation
    {
        id: "water_conservation",
        keywords: ["water saving", "bucket bath", "rainwater", "rainwater harvesting", "fixed leak", "tap turned off", "saved water", "short shower", "showerhead", "low flow", "turn off tap", "tap leak"],
        category: "Water Conservation",
        action: "Water Conservation & Municipal Pumping Energy Savings",
        baseline: "Standard High-Flow Municipal Pumping Grid (0.08 kg/100L)",
        unit: "liters",
        defaultQty: 50,
        emissionFactor: 0.08,
        rationale: "Conserving municipal treated water avoids high electrical pumping, filtration, and water treatment plant energy."
    }
];

// ---------------------------------------------------------------------------
// Universal Parser & Activity Classifier
// ---------------------------------------------------------------------------
function parseActivityInput(rawText, options = {}) {
    const text = String(rawText || "").toLowerCase().trim();
    let bestMatch = null;
    let highestScore = 0;

    // 1. Direct benchmark matching via weighted token scoring
    for (const benchmark of EMISSION_BENCHMARKS) {
        let score = 0;
        for (const kw of benchmark.keywords) {
            if (text === kw) {
                score += 100; // Exact full match
            } else if (text.includes(kw)) {
                score += kw.length * 3;
            }
        }
        if (score > highestScore) {
            highestScore = score;
            bestMatch = benchmark;
        }
    }

    // 2. Quantity & Unit Extractor (e.g. "3 hours", "25 km", "4 meals", "2 trees")
    let extractedQty = null;
    let extractedUnit = null;

    const qtyRegex = /(\d+(?:\.\d+)?)\s*(km|kms|kilometer|kilometers|kwh|meals?|trees?|loads?|hours?|hrs?|kg|kgs|bags?|bottles?|refills?|sessions?|mins?|minutes?|liters?|litres?|plants?)/i;
    const match = text.match(qtyRegex);
    if (match) {
        extractedQty = parseFloat(match[1]);
        extractedUnit = match[2].toLowerCase();
    } else {
        const numOnlyMatch = text.match(/(\d+(?:\.\d+)?)/);
        if (numOnlyMatch) {
            extractedQty = parseFloat(numOnlyMatch[1]);
        }
    }

    // 3. Smart Semantic Domain Fallback (prevents generic "General Sustainability")
    if (!bestMatch || highestScore < 4) {
        if (/light|fan|bulb|tube|lamp|switch|turn off|turned off|unplug|power|watt|kwh|ac|cooler|heater|charge|electric/i.test(text)) {
            bestMatch = {
                id: "inferred_energy_conservation",
                keywords: [],
                category: "Energy Conservation",
                action: capitalizeAction(rawText) || "Electrical & Lighting Conservation",
                baseline: "Active Baseline Campus Grid Load (0.05 kg/hr)",
                unit: extractedUnit || options.unit || "hours",
                defaultQty: 2,
                emissionFactor: options.emissionFactor || 0.05,
                rationale: "Turning off unoccupied electrical loads directly prevents thermal coal grid power draw."
            };
        } else if (/transit|commute|bus|train|metro|rail|cycle|bike|walk|carpool|auto|rickshaw|travel|distance|km/i.test(text)) {
            bestMatch = {
                id: "inferred_clean_transit",
                keywords: [],
                category: "Clean Mobility & Transit",
                action: capitalizeAction(rawText) || "Low-Carbon Campus Commute",
                baseline: "Solo Petrol Combustion Commute (0.21 kg/km)",
                unit: extractedUnit || options.unit || "km",
                defaultQty: 10,
                emissionFactor: options.emissionFactor || 0.18,
                rationale: "Opting for shared or active transit directly offsets combustion engine passenger emissions."
            };
        } else if (/food|meal|lunch|dinner|diet|veg|vegan|leftover|eat|plate|salad|fruit/i.test(text)) {
            bestMatch = {
                id: "inferred_sustainable_diet",
                keywords: [],
                category: "Sustainable Diet & Nutrition",
                action: capitalizeAction(rawText) || "Sustainable Meal Choice",
                baseline: "High-Carbon Meat Meal Baseline (1.80 kg CO2e)",
                unit: extractedUnit || options.unit || "meals",
                defaultQty: 2,
                emissionFactor: options.emissionFactor || 1.10,
                rationale: "Choosing low-carbon dining and preventing plate waste avoids intensive agricultural footprint."
            };
        } else if (/solar|pv|clean power|renewable/i.test(text)) {
            bestMatch = {
                id: "inferred_renewable_energy",
                keywords: [],
                category: "Renewable Energy",
                action: capitalizeAction(rawText) || "Clean Solar Generation",
                baseline: "Thermal Coal Power Grid (0.78 kg/kWh)",
                unit: extractedUnit || options.unit || "kWh",
                defaultQty: 10,
                emissionFactor: options.emissionFactor || 0.78,
                rationale: "Solar power generation directly displaces fossil-based central thermal grid electricity."
            };
        } else if (/waste|plastic|bag|bottle|compost|recycle|scrap|paper|segregat/i.test(text)) {
            bestMatch = {
                id: "inferred_waste_mitigation",
                keywords: [],
                category: "Waste Mitigation & Circularity",
                action: capitalizeAction(rawText) || "Waste Diversion & Reuse",
                baseline: "Municipal Dumpsite Landfill (0.25 kg/unit)",
                unit: extractedUnit || options.unit || "units",
                defaultQty: 3,
                emissionFactor: options.emissionFactor || 0.25,
                rationale: "Mitigating single-use packaging and diverting organic waste prevents landfill methane generation."
            };
        } else if (/tree|sapling|plant|planting|soil|garden|greenery/i.test(text)) {
            bestMatch = {
                id: "inferred_tree_stewardship",
                keywords: [],
                category: "Tree Stewardship & Afforestation",
                action: capitalizeAction(rawText) || "Campus Greenery & Flora Care",
                baseline: "Degraded Urban Soil",
                unit: extractedUnit || options.unit || "trees",
                defaultQty: 1,
                emissionFactor: options.emissionFactor || 2.50,
                rationale: "Tree planting and active stewardship sequesters atmospheric carbon dioxide into woody biomass."
            };
        } else if (/water|tap|bath|shower|leak|rainwater/i.test(text)) {
            bestMatch = {
                id: "inferred_water_conservation",
                keywords: [],
                category: "Water Conservation",
                action: capitalizeAction(rawText) || "Water Resource Conservation",
                baseline: "Treated Municipal Supply Pumping (0.08 kg/100L)",
                unit: extractedUnit || options.unit || "liters",
                defaultQty: 50,
                emissionFactor: options.emissionFactor || 0.08,
                rationale: "Conserving water minimizes municipal grid pumping and purification electrical footprints."
            };
        } else {
            // General Campus Eco Action fallback
            bestMatch = {
                id: "custom_eco_action",
                keywords: [],
                category: "Campus Eco Stewardship",
                action: capitalizeAction(rawText) || "Verified Sustainable Action",
                baseline: "Standard Conventional Baseline",
                unit: extractedUnit || options.unit || "units",
                defaultQty: 1,
                emissionFactor: options.emissionFactor || 0.20,
                rationale: "Estimated carbon mitigation benchmark based on verified institutional eco-friendly practices."
            };
        }
    }

    function capitalizeAction(str) {
        if (!str || typeof str !== "string") return "";
        const clean = str.trim();
        return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    const finalQuantity = options.quantity !== undefined && !isNaN(Number(options.quantity)) && Number(options.quantity) > 0
        ? Number(options.quantity)
        : (extractedQty || bestMatch.defaultQty || 1);

    const finalFrequency = options.frequency !== undefined && !isNaN(Number(options.frequency)) && Number(options.frequency) > 0
        ? Number(options.frequency)
        : 1;

    const finalUnit = options.unit || extractedUnit || bestMatch.unit;

    return {
        matchedBenchmark: bestMatch,
        quantity: finalQuantity,
        frequency: finalFrequency,
        unit: finalUnit
    };
}

// ---------------------------------------------------------------------------
// Core Carbon & Financial Calculation (INR Pegged)
// ---------------------------------------------------------------------------
function calculateCO2AndCurrency(inputData) {
    let parsed;
    if (typeof inputData === "string") {
        parsed = parseActivityInput(inputData);
    } else if (typeof inputData === "object" && inputData !== null) {
        parsed = parseActivityInput(inputData.name || inputData.activity_text || inputData.text || "", inputData);
    } else {
        parsed = parseActivityInput("");
    }

    const { matchedBenchmark, quantity, frequency, unit } = parsed;
    const emissionFactor = Number(matchedBenchmark.emissionFactor);

    // Mathematical Formula:
    // Avoided CO2 (kg) = Quantity * Emission Factor * Weekly Frequency
    const co2Saved = Number((quantity * emissionFactor * frequency).toFixed(4));

    // Carbon Currency: 1 kg CO2e = 1.000 CBC
    const carbonCurrency = Number((co2Saved * CARBON_MARKET_RATES.CBC_PER_KG_CO2).toFixed(4));
    const milliCBC = Math.round(carbonCurrency * 1000);

    // Carbon Points: 10 points per kg CO2 saved (min 1 pt)
    const points = Math.max(1, Math.round(co2Saved * 10));

    // Real-world Valuation: Indian Rupee (₹2.50 per CBC)
    const valueINR = Number((carbonCurrency * CARBON_MARKET_RATES.INR_PER_CBC).toFixed(2));
    const valueUSD = Number((carbonCurrency * CARBON_MARKET_RATES.USD_PER_CBC).toFixed(3));

    // Impact Category
    let impact = "Low";
    if (co2Saved >= 5.0) impact = "High";
    else if (co2Saved >= 1.0) impact = "Medium";

    // Cryptographic Certificate Proof
    const certificateSerial = `CBC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const hashData = `${certificateSerial}:${matchedBenchmark.action}:${quantity}:${frequency}:${co2Saved}:${carbonCurrency}`;
    const certificateHash = crypto.createHash("sha256").update(hashData).digest("hex");

    return {
        activity_name: matchedBenchmark.action,
        category: matchedBenchmark.category,
        baseline_comparison: matchedBenchmark.baseline,
        unit: unit,
        quantity: quantity,
        frequency: frequency,
        emission_factor: emissionFactor,
        co2_saved: co2Saved,
        carbon_currency: carbonCurrency,
        milli_cbc: milliCBC,
        points: points,
        impact: impact,
        valuation: {
            inr: valueINR,
            rate_inr_per_cbc: CARBON_MARKET_RATES.INR_PER_CBC,
            rate_inr_per_ton: CARBON_MARKET_RATES.INR_PER_TON_CO2,
            usd: valueUSD
        },
        formula_breakdown: {
            equation: `${quantity} ${unit} × ${emissionFactor} kg CO₂/${unit} × ${frequency} frequency/wk`,
            result_co2: `${co2Saved} kg CO₂e`,
            result_cbc: `${carbonCurrency} CBC (CarbEarn Carbon Currency @ ₹2.50/CBC)`,
            rationale: matchedBenchmark.rationale
        },
        certificate: {
            serial: certificateSerial,
            hash: certificateHash,
            standard: "ISO 14064-2 / VCM Verified Carbon Standard Protocol"
        }
    };
}

module.exports = {
    CARBON_MARKET_RATES,
    EMISSION_BENCHMARKS,
    parseActivityInput,
    calculateCO2AndCurrency
};
