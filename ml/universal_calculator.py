"""
CarbEarn Universal Dynamic Activity & Carbon Currency Calculator (Python Microservice)

Provides real-time natural language parsing, IPCC/EPA emission factor resolution,
CO2 avoidance calculation, and Carbon Currency (CBC) tokenomics.
Pegged for India: 1 kg CO2e = 1.000 CBC = ₹2.50 INR.
"""

import re
import hashlib
import time

CARBON_MARKET_RATES = {
    "CBC_PER_KG_CO2": 1.0,
    "INR_PER_CBC": 2.50,
    "INR_PER_TON_CO2": 2500.0,
    "USD_PER_CBC": 0.030
}

EMISSION_BENCHMARKS = [
    # 1. Energy Conservation
    {
        "id": "classroom_lighting_fan",
        "keywords": [
            "switch off light", "switched off light", "switched of light", "turn off light", "turned off light",
            "switch off lights", "switched off lights", "switched of lights", "turn off lights", "turned off lights",
            "lights off", "light off", "classroom light", "classroom lights", "tubelight", "tube light", "room light",
            "room lights", "fan off", "fans off", "switch off fan", "switched off fan", "switched of fan", "turn off fan",
            "turned off fan", "classroom fan", "classroom fans", "switched of lights of the classroom",
            "switched off lights of the classroom", "turned off lights of the classroom",
            "light", "lights", "lamp", "lamps", "bulb", "bulbs", "fan", "fans", "tubelights"
        ],
        "category": "Energy Conservation",
        "action": "Turned Off Classroom/Room Lighting & Fans",
        "baseline": "Active 40-60W Classroom Fixtures Left Running (0.05 kg/hr)",
        "unit": "hours",
        "default_qty": 3,
        "emission_factor": 0.05,
        "rationale": "Deactivating unoccupied classroom fixtures prevents continuous coal thermal grid electricity draw (~0.05 kg CO2e/hr)."
    },
    {
        "id": "appliance_powerdown",
        "keywords": [
            "unplug", "unplugged", "charger", "laptop charger", "pc shutdown", "computer shutdown", "lab computer",
            "monitor", "projector", "standby power", "vampire power", "phantom load", "power down", "idle appliance"
        ],
        "category": "Energy Conservation",
        "action": "Appliance & System Standby Power-Down",
        "baseline": "Standby Phantom Electrical Load (0.04 kg/hr)",
        "unit": "hours",
        "default_qty": 4,
        "emission_factor": 0.04,
        "rationale": "Eliminating idle and standby appliance power directly reduces institutional thermal electrical demand."
    },
    {
        "id": "led_lighting",
        "keywords": ["led", "cfl", "fluorescent", "compact fluorescent", "led bulb", "led tube"],
        "category": "Energy Conservation",
        "action": "High-Efficiency Solid-State LED Usage",
        "baseline": "60W Incandescent Lamp (0.042 kg/hr saved)",
        "unit": "hours",
        "default_qty": 8,
        "emission_factor": 0.042,
        "rationale": "Replacing incandescent lamps with 9W LEDs reduces electrical demand by >85%, saving 0.042 kg CO2 per hour."
    },
    {
        "id": "electricity_conservation",
        "keywords": ["electricity saving", "kwh", "power saving", "conserved electricity", "conserved power", "saved electricity", "saved power"],
        "category": "Energy Conservation",
        "action": "Direct Electrical Grid Conservation",
        "baseline": "Standard Regional Grid Mix (0.82 kg/kWh)",
        "unit": "kWh",
        "default_qty": 5,
        "emission_factor": 0.82,
        "rationale": "Every kilowatt-hour conserved directly prevents combustion of coal at central thermal power generation facilities."
    },
    {
        "id": "air_conditioning_adjustment",
        "keywords": ["ac", "air condition", "thermostat", "temperature setting", "cooling", "chiller", "air conditioner"],
        "category": "Energy Conservation",
        "action": "Smart AC Temperature Optimization (24°C+)",
        "baseline": "Sub-20°C Overcooling (1.2 kWh/hr)",
        "unit": "hours",
        "default_qty": 6,
        "emission_factor": 0.25,
        "rationale": "Operating air conditioning at 24°C conserves 18-24% compressor power, saving ~0.25 kg CO2/hr."
    },
    {
        "id": "cold_wash_laundry",
        "keywords": ["cold water", "cold wash", "laundry", "washing machine", "cold cycle"],
        "category": "Energy Conservation",
        "action": "Cold Water Laundry Cycle",
        "baseline": "Hot Water Laundry Heating (1.8 kWh/cycle)",
        "unit": "loads",
        "default_qty": 3,
        "emission_factor": 1.48,
        "rationale": "Washing laundry cold eliminates ~1.48 kg CO2 per load by avoiding electric water heating."
    },
    {
        "id": "air_drying_clothes",
        "keywords": ["air dry", "line dry", "clothesline", "sun dry", "tumble dry"],
        "category": "Energy Conservation",
        "action": "Line / Natural Sun Drying Clothes",
        "baseline": "Electric Resistance Tumble Dryer (2.5 kWh/load)",
        "unit": "loads",
        "default_qty": 2,
        "emission_factor": 2.05,
        "rationale": "Drying clothes in sunlight and air avoids mechanical tumble dryer heating electricity."
    },

    # 2. Renewable Energy
    {
        "id": "solar_generation",
        "keywords": ["solar", "photovoltaic", "pv panel", "solar panel", "solar generation", "clean power", "solar rooftop"],
        "category": "Renewable Energy",
        "action": "Rooftop Solar Clean Energy Generation",
        "baseline": "Thermal Coal Grid Electricity (0.82 kg/kWh)",
        "unit": "kWh",
        "default_qty": 15,
        "emission_factor": 0.78,
        "rationale": "Solar photovoltaic generation displaces high-carbon coal thermal grid electricity (~0.78 kg net avoided CO2/kWh)."
    },

    # 3. Clean Mobility & Transit
    {
        "id": "train_transit",
        "keywords": ["train", "metro", "subway", "rail", "commuter", "light rail", "local train", "electric train"],
        "category": "Clean Mobility & Transit",
        "action": "Electric Rail / Metro Transit",
        "baseline": "Solo Petrol Car Commute (0.21 kg/km)",
        "unit": "km",
        "default_qty": 15,
        "emission_factor": 0.18,
        "rationale": "Electric rail transit emits ~0.03 kg CO2/p-km compared to 0.21 kg/km for solo combustion automobile travel."
    },
    {
        "id": "cycling",
        "keywords": ["cycle", "cycling", "bike", "bicycle", "pedal", "bicycled", "biking"],
        "category": "Clean Mobility & Transit",
        "action": "Bicycle Zero-Emission Commute",
        "baseline": "Combustion Engine Vehicle (0.21 kg/km)",
        "unit": "km",
        "default_qty": 8,
        "emission_factor": 0.21,
        "rationale": "Zero-tailpipe bicycle commute fully offsets combustion vehicle emissions of 0.21 kg CO2 per kilometer."
    },
    {
        "id": "walking",
        "keywords": ["walk", "walking", "pedestrian", "on foot", "stroll", "walked"],
        "category": "Clean Mobility & Transit",
        "action": "Zero-Emission Walking",
        "baseline": "Short Urban Car Trip (0.15 kg/km)",
        "unit": "km",
        "default_qty": 3,
        "emission_factor": 0.15,
        "rationale": "Walking eliminates short high-emission cold-engine car journeys."
    },
    {
        "id": "bus_transit",
        "keywords": ["bus", "public transit", "shuttle", "coach", "city bus", "college bus"],
        "category": "Clean Mobility & Transit",
        "action": "Public Bus Transit",
        "baseline": "Solo Passenger Car (0.21 kg/km)",
        "unit": "km",
        "default_qty": 12,
        "emission_factor": 0.12,
        "rationale": "Shared mass transit bus achieves high occupancy, mitigating 0.12 kg CO2 per passenger-kilometer."
    },
    {
        "id": "carpooling",
        "keywords": ["carpool", "carpooling", "shared ride", "liftshare", "rideshare", "shared auto", "auto rickshaw", "e-rickshaw"],
        "category": "Clean Mobility & Transit",
        "action": "Vehicular Carpooling / Shared Transit",
        "baseline": "Solo Vehicle Commute (0.21 kg/km)",
        "unit": "km",
        "default_qty": 15,
        "emission_factor": 0.14,
        "rationale": "Sharing vehicular trips reduces per-person commute footprint significantly."
    },
    {
        "id": "ev_transit",
        "keywords": ["ev", "electric vehicle", "electric car", "e-bike", "electric scooter", "scooter", "ev scooter"],
        "category": "Clean Mobility & Transit",
        "action": "Electric Vehicle Commute",
        "baseline": "Internal Combustion Engine Vehicle (0.21 kg/km)",
        "unit": "km",
        "default_qty": 20,
        "emission_factor": 0.16,
        "rationale": "Electric vehicles produce far lower lifecycle emissions than conventional combustion engines."
    },
    {
        "id": "work_from_home",
        "keywords": ["work from home", "remote work", "telecommute", "wfh", "telecommuting", "home office", "remote study"],
        "category": "Clean Mobility & Transit",
        "action": "Remote Work / Study (Avoided Commute)",
        "baseline": "Roundtrip Vehicle Commute (0.21 kg/km)",
        "unit": "km",
        "default_qty": 25,
        "emission_factor": 0.21,
        "rationale": "Eliminating physical office transit avoids all tailpipe emissions along the route."
    },

    # 4. Sustainable Diet & Nutrition
    {
        "id": "plant_based_meal",
        "keywords": ["vegan", "plant-based", "plant based", "vegetarian meal", "no beef", "meatless", "tofu", "veg thali", "dal chawal"],
        "category": "Sustainable Diet & Nutrition",
        "action": "Plant-Based / Vegetarian Meal Choice",
        "baseline": "High-Carbon Meat Meal (3.3 kg CO2e/meal)",
        "unit": "meals",
        "default_qty": 3,
        "emission_factor": 2.80,
        "rationale": "Choosing plant-based dining avoids high livestock feed and enteric methane emissions."
    },
    {
        "id": "vegetarian_meal",
        "keywords": ["vegetarian", "meatless monday", "no meat", "dairy veg", "veg meal"],
        "category": "Sustainable Diet & Nutrition",
        "action": "Vegetarian Diet Option",
        "baseline": "Conventional Mixed Meat Meal (1.8 kg CO2e/meal)",
        "unit": "meals",
        "default_qty": 5,
        "emission_factor": 1.10,
        "rationale": "Vegetarian meals avoid high livestock land and water footprints."
    },
    {
        "id": "food_waste_mitigation",
        "keywords": ["food waste", "zero waste", "leftovers", "prevent food waste", "ate leftovers", "finished food", "no food waste"],
        "category": "Sustainable Diet & Nutrition",
        "action": "Food Waste Prevention & Plate Clearance",
        "baseline": "Landfilled Food Anaerobic Rotting (2.5 kg CO2e/kg)",
        "unit": "kg",
        "default_qty": 2,
        "emission_factor": 2.50,
        "rationale": "Preventing edible food from rotting avoids embodied farming, processing, and landfill methane emissions."
    },

    # 5. Waste Mitigation & Circularity
    {
        "id": "composting",
        "keywords": ["compost", "composting", "organic waste", "food scrap", "biodegradable", "vermicompost"],
        "category": "Waste Mitigation & Circularity",
        "action": "Organic Waste Aerobic Composting",
        "baseline": "Anaerobic Landfill Methane Generation (0.85 kg CO2e/kg)",
        "unit": "kg",
        "default_qty": 5,
        "emission_factor": 0.85,
        "rationale": "Aerobic composting prevents anaerobic decomposition in municipal landfills which releases methane."
    },
    {
        "id": "reusable_bottle",
        "keywords": ["reusable bottle", "water bottle", "flask", "tumbler", "refill", "avoid plastic bottle", "steel bottle"],
        "category": "Waste Mitigation & Circularity",
        "action": "Reusable Beverage Container",
        "baseline": "Single-Use PET Bottle Manufacturing (0.082 kg/bottle)",
        "unit": "refills",
        "default_qty": 10,
        "emission_factor": 0.082,
        "rationale": "Avoiding single-use PET bottles eliminates petroleum refining and plastic manufacturing energy."
    },
    {
        "id": "reusable_bag",
        "keywords": ["tote bag", "canvas bag", "reusable bag", "shopping bag", "cloth bag", "avoid plastic bag", "jute bag"],
        "category": "Waste Mitigation & Circularity",
        "action": "Reusable Cloth / Jute Shopping Bag",
        "baseline": "Single-Use Plastic Bag (0.05 kg/bag)",
        "unit": "bags",
        "default_qty": 8,
        "emission_factor": 0.05,
        "rationale": "Reusable cloth and jute bags eliminate single-use plastic polymer film manufacturing."
    },
    {
        "id": "recycling_paper",
        "keywords": ["paper recycling", "cardboard", "recycled paper", "carton", "newspaper recycling"],
        "category": "Waste Mitigation & Circularity",
        "action": "Paper & Cardboard Recycling",
        "baseline": "Virgin Wood Pulp Processing (1.1 kg CO2/kg)",
        "unit": "kg",
        "default_qty": 5,
        "emission_factor": 1.10,
        "rationale": "Recycling paper preserves forest carbon sinks and reduces chemical paper mill emissions."
    },

    # 6. Tree Stewardship & Afforestation
    {
        "id": "tree_planting",
        "keywords": ["tree", "sapling", "planted tree", "afforestation", "reforestation", "plant trees", "neem", "peepal", "banyan", "gulmohar"],
        "category": "Tree Stewardship & Afforestation",
        "action": "Native Tree Afforestation",
        "baseline": "Degraded Urban Soil",
        "unit": "trees",
        "default_qty": 1,
        "emission_factor": 21.77,
        "rationale": "A native sapling sequesters an average of 21.77 kg CO2 annually as it matures."
    },
    {
        "id": "tree_care",
        "keywords": ["watering tree", "tree care", "mulching", "sapling care", "pruning", "plant watering", "gardening"],
        "category": "Tree Stewardship & Afforestation",
        "action": "GreenProof Tree Stewardship & Maintenance",
        "baseline": "Sapling Mortality Without Care",
        "unit": "sessions",
        "default_qty": 2,
        "emission_factor": 2.50,
        "rationale": "Active tree maintenance increases survival rate from 40% to over 90%, locking in long-term sequestration."
    },

    # 7. Water Conservation
    {
        "id": "water_conservation",
        "keywords": ["water saving", "bucket bath", "rainwater", "rainwater harvesting", "fixed leak", "tap turned off", "saved water", "short shower"],
        "category": "Water Conservation",
        "action": "Water Conservation & Municipal Pumping Energy Savings",
        "baseline": "Standard High-Flow Municipal Pumping Grid (0.08 kg/100L)",
        "unit": "liters",
        "default_qty": 50,
        "emission_factor": 0.08,
        "rationale": "Conserving water minimizes municipal grid pumping and filtration electrical footprints."
    }
]


def calculate_universal(text, quantity=None, frequency=None, unit=None):
    clean_text = str(text or "").lower().strip()
    best_match = None
    highest_score = 0

    # 1. Benchmark Token Scoring
    for b in EMISSION_BENCHMARKS:
        score = 0
        for kw in b["keywords"]:
            if clean_text == kw:
                score += 100
            elif kw in clean_text:
                score += len(kw) * 3
        if score > highest_score:
            highest_score = score
            best_match = b

    # 2. Quantity & Unit Extractor
    extracted_qty = None
    extracted_unit = None
    match = re.search(r"(\d+(?:\.\d+)?)\s*(km|kms|kwh|meals?|trees?|loads?|hours?|hrs?|kg|bags?|bottles?|sessions?|liters?)", clean_text)
    if match:
        extracted_qty = float(match.group(1))
        extracted_unit = match.group(2).lower()
    else:
        num_match = re.search(r"(\d+(?:\.\d+)?)", clean_text)
        if num_match:
            extracted_qty = float(num_match.group(1))

    # 3. Semantic Fallback
    if not best_match or highest_score < 4:
        if re.search(r"light|fan|bulb|tube|lamp|switch|turn off|turned off|unplug|power|watt|kwh|ac|cooler|heater|charge|electric", clean_text):
            best_match = {
                "category": "Energy Conservation",
                "action": clean_text.title() or "Electrical & Lighting Conservation",
                "baseline": "Active Baseline Campus Grid Load (0.05 kg/hr)",
                "unit": extracted_unit or unit or "hours",
                "default_qty": 2,
                "emission_factor": 0.05,
                "rationale": "Turning off unoccupied electrical loads directly prevents thermal coal grid power draw."
            }
        elif re.search(r"transit|commute|bus|train|metro|rail|cycle|bike|walk|carpool|auto|rickshaw|travel|distance|km", clean_text):
            best_match = {
                "category": "Clean Mobility & Transit",
                "action": clean_text.title() or "Low-Carbon Campus Commute",
                "baseline": "Solo Petrol Combustion Commute (0.21 kg/km)",
                "unit": extracted_unit or unit or "km",
                "default_qty": 10,
                "emission_factor": 0.18,
                "rationale": "Opting for shared or active transit directly offsets combustion engine passenger emissions."
            }
        elif re.search(r"food|meal|lunch|dinner|diet|veg|vegan|leftover|eat|plate|salad|fruit", clean_text):
            best_match = {
                "category": "Sustainable Diet & Nutrition",
                "action": clean_text.title() or "Sustainable Meal Choice",
                "baseline": "High-Carbon Meat Meal Baseline (1.80 kg CO2e)",
                "unit": extracted_unit or unit or "meals",
                "default_qty": 2,
                "emission_factor": 1.10,
                "rationale": "Choosing low-carbon dining and preventing plate waste avoids intensive agricultural footprint."
            }
        elif re.search(r"solar|pv|clean power|renewable", clean_text):
            best_match = {
                "category": "Renewable Energy",
                "action": clean_text.title() or "Clean Solar Generation",
                "baseline": "Thermal Coal Power Grid (0.78 kg/kWh)",
                "unit": extracted_unit or unit or "kWh",
                "default_qty": 10,
                "emission_factor": 0.78,
                "rationale": "Solar power generation directly displaces fossil-based central thermal grid electricity."
            }
        elif re.search(r"waste|plastic|bag|bottle|compost|recycle|scrap|paper|segregat", clean_text):
            best_match = {
                "category": "Waste Mitigation & Circularity",
                "action": clean_text.title() or "Waste Diversion & Reuse",
                "baseline": "Municipal Dumpsite Landfill (0.25 kg/unit)",
                "unit": extracted_unit or unit or "units",
                "default_qty": 3,
                "emission_factor": 0.25,
                "rationale": "Mitigating single-use packaging and diverting organic waste prevents landfill methane generation."
            }
        elif re.search(r"tree|sapling|plant|planting|soil|garden|greenery", clean_text):
            best_match = {
                "category": "Tree Stewardship & Afforestation",
                "action": clean_text.title() or "Campus Greenery & Flora Care",
                "baseline": "Degraded Urban Soil",
                "unit": extracted_unit or unit or "trees",
                "default_qty": 1,
                "emission_factor": 2.50,
                "rationale": "Tree planting and active stewardship sequesters atmospheric carbon dioxide into woody biomass."
            }
        elif re.search(r"water|tap|bath|shower|leak|rainwater", clean_text):
            best_match = {
                "category": "Water Conservation",
                "action": clean_text.title() or "Water Resource Conservation",
                "baseline": "Treated Municipal Supply Pumping (0.08 kg/100L)",
                "unit": extracted_unit or unit or "liters",
                "default_qty": 50,
                "emission_factor": 0.08,
                "rationale": "Conserving water minimizes municipal grid pumping and purification electrical footprints."
            }
        else:
            best_match = {
                "category": "Campus Eco Stewardship",
                "action": clean_text.title() or "Verified Sustainable Action",
                "baseline": "Standard Conventional Baseline",
                "unit": extracted_unit or unit or "units",
                "default_qty": 1,
                "emission_factor": 0.20,
                "rationale": "Estimated carbon mitigation benchmark based on verified institutional eco-friendly practices."
            }

    qty = float(quantity) if quantity is not None and float(quantity) > 0 else (extracted_qty or best_match.get("default_qty", 1))
    freq = float(frequency) if frequency is not None and float(frequency) > 0 else 1.0
    u = unit or extracted_unit or best_match["unit"]
    ef = float(best_match["emission_factor"])

    co2_saved = round(qty * ef * freq, 4)
    cbc = round(co2_saved * CARBON_MARKET_RATES["CBC_PER_KG_CO2"], 4)
    points = max(1, round(co2_saved * 10))

    impact = "Low"
    if co2_saved >= 5.0:
        impact = "High"
    elif co2_saved >= 1.0:
        impact = "Medium"

    serial = f"CBC-{int(time.time()*1000):X}"
    cert_hash = hashlib.sha256(f"{serial}:{best_match['action']}:{qty}:{freq}:{co2_saved}:{cbc}".encode()).hexdigest()

    return {
        "activity_name": best_match["action"],
        "category": best_match["category"],
        "baseline_comparison": best_match["baseline"],
        "unit": u,
        "quantity": qty,
        "frequency": freq,
        "emission_factor": ef,
        "co2_saved": co2_saved,
        "carbon_currency": cbc,
        "points": points,
        "impact": impact,
        "valuation": {
            "inr": round(cbc * CARBON_MARKET_RATES["INR_PER_CBC"], 2),
            "rate_inr_per_cbc": CARBON_MARKET_RATES["INR_PER_CBC"],
            "rate_inr_per_ton": CARBON_MARKET_RATES["INR_PER_TON_CO2"],
            "usd": round(cbc * CARBON_MARKET_RATES["USD_PER_CBC"], 3)
        },
        "formula_breakdown": {
            "equation": f"{qty} {u} × {ef} kg CO₂/{u} × {freq} frequency/wk",
            "result_co2": f"{co2_saved} kg CO₂e",
            "result_cbc": f"{cbc} CBC (CarbEarn Carbon Currency @ ₹2.50/CBC)",
            "rationale": best_match["rationale"]
        },
        "certificate": {
            "serial": serial,
            "hash": cert_hash,
            "standard": "ISO 14064-2 / VCM Verified Carbon Standard Protocol"
        }
    }
