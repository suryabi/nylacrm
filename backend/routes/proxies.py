"""
Proxy API routes - quotes, weather, and other external service proxies
to avoid CORS issues in production.
"""
from fastapi import APIRouter, HTTPException
import httpx
import random

router = APIRouter()


WATER_QUOTES = [
    {"q": "Water is the driving force of all nature.", "a": "Leonardo da Vinci"},
    {"q": "Thousands have lived without love, not one without water.", "a": "W.H. Auden"},
    {"q": "Water is life, and clean water means health.", "a": "Audrey Hepburn"},
    {"q": "Pure water is the world's first and foremost medicine.", "a": "Slovakian Proverb"},
    {"q": "When the well is dry, we know the worth of water.", "a": "Benjamin Franklin"},
    {"q": "Water is the soul of the Earth.", "a": "W.H. Auden"},
    {"q": "In one drop of water are found all the secrets of all the oceans.", "a": "Kahlil Gibran"},
    {"q": "Nothing is softer or more flexible than water, yet nothing can resist it.", "a": "Lao Tzu"},
    {"q": "Water is the most critical resource issue of our lifetime.", "a": "Rosegrant"},
    {"q": "We forget that the water cycle and the life cycle are one.", "a": "Jacques Cousteau"},
    {"q": "Water links us to our neighbor in a way more profound than any other.", "a": "John Thorson"},
    {"q": "The cure for anything is salt water: sweat, tears, or the sea.", "a": "Isak Dinesen"},
    {"q": "Water is sacred to all human beings.", "a": "Rigoberta Menchu"},
    {"q": "A drop of water is worth more than a sack of gold to a thirsty man.", "a": "Unknown"},
    {"q": "By means of water, we give life to everything.", "a": "Quran"},
    {"q": "Water is the mirror that has the ability to show us what we cannot see.", "a": "Masaru Emoto"},
    {"q": "Heavy hearts, like heavy clouds in the sky, are best relieved by letting water out.", "a": "Christopher Morley"},
    {"q": "Access to safe water is a fundamental human need.", "a": "Kofi Annan"},
    {"q": "Clean water and sanitation are human rights.", "a": "Pope Francis"},
    {"q": "Water is life's matter and matrix, mother and medium.", "a": "Albert Szent-Gyorgyi"},
    {"q": "The water you touch in a river is the last of that which has passed, and the first of that which is coming.", "a": "Leonardo da Vinci"},
    {"q": "Water sustains all.", "a": "Thales of Miletus"},
    {"q": "Rivers know this: there is no hurry. We shall get there some day.", "a": "A.A. Milne"},
    {"q": "Water is the best of all things.", "a": "Pindar"},
    {"q": "If there is magic on this planet, it is contained in water.", "a": "Loren Eiseley"},
    {"q": "We never know the worth of water till the well is dry.", "a": "Thomas Fuller"},
    {"q": "Water is the one substance from which the earth can conceal nothing.", "a": "Loren Eiseley"},
    {"q": "Human nature is like water. It takes the shape of its container.", "a": "Wallace Stevens"},
    {"q": "Ocean is more ancient than the mountains, and freighted with the memories of time.", "a": "H.P. Lovecraft"},
    {"q": "Water, in all its forms, is what makes our planet a wonderful place to live.", "a": "Unknown"},
    {"q": "The world's freshwater is a shared resource that must be protected.", "a": "Mikhail Gorbachev"},
]


@router.get("/quotes/water")
async def get_water_quote():
    """Returns a random water-related quote"""
    quote = random.choice(WATER_QUOTES)
    return {"quote": quote["q"], "author": quote["a"]}


@router.get("/quotes/sales")
async def get_sales_quote():
    """Proxy endpoint for ZenQuotes API for inspirational sales quotes"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://zenquotes.io/api/random",
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            if data and len(data) > 0:
                return {"quote": data[0]["q"], "author": data[0]["a"]}
            else:
                return {"quote": "Success is not the key to happiness. Happiness is the key to success.", "author": "Albert Schweitzer"}
    except Exception as e:
        print(f"ZenQuotes API error: {str(e)}")
        return {"quote": "The secret of getting ahead is getting started.", "author": "Mark Twain"}


@router.get("/weather")
async def get_weather(latitude: float, longitude: float):
    """Proxy endpoint for Open-Meteo weather API to avoid CORS issues"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    "timezone": "auto"
                },
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Weather service timeout")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Weather service error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch weather: {str(e)}")
