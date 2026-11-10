const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const KINDWISE_API_URL =
  "https://plant.id/api/v3/identification?details=description,treatment,cause";

function getProviderErrorMessage(payload, rawBody) {
  const candidates = [
    payload?.message,
    payload?.detail,
    payload?.error?.message,
    payload?.error?.detail,
    payload?.error,
    payload?.errors,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate
        .map((item) =>
          typeof item === "string"
            ? item
            : item?.msg || item?.message || JSON.stringify(item),
        )
        .join("; ");
    }
    if (candidate && typeof candidate === "object") {
      return JSON.stringify(candidate);
    }
  }

  return rawBody.trim() || "Kindwise returned an empty error response.";
}

function getTextItems(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => getTextItems(item));
  }
  if (value && typeof value === "object") {
    const text = value.name || value.description || value.text;
    return text ? [text] : Object.values(value).flatMap(getTextItems);
  }
  return [];
}

app.post("/api/diagnose", async (req, res) => {
  const { imageBase64, imageMimeType = "image/jpeg" } = req.body ?? {};

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return res.status(400).json({ error: "Base64 leaf image is required." });
  }
  if (!process.env.KINDWISE_API_KEY) {
    return res.status(503).json({
      error:
        "Diagnosis is not configured. Set KINDWISE_API_KEY in the server's .env file and restart the server.",
    });
  }
  if (
    !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(
      imageMimeType,
    )
  ) {
    return res.status(415).json({
      error: `Unsupported image type: ${imageMimeType}. Choose a JPEG, PNG, WebP, or HEIC image.`,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const imageData = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${imageMimeType};base64,${imageBase64}`;
    const response = await fetch(KINDWISE_API_URL, {
      method: "POST",
      headers: {
        "Api-Key": process.env.KINDWISE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        images: [imageData],
        health: "all",
      }),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const providerMessage = getProviderErrorMessage(payload, rawBody);
      console.error(`Kindwise diagnosis failed (${response.status}):`, providerMessage);

      if (response.status === 401 || response.status === 403) {
        return res.status(503).json({
          error:
            "Kindwise rejected the API key. Check KINDWISE_API_KEY in the server's .env file and confirm the key is active.",
        });
      }
      if (response.status === 429) {
        return res.status(503).json({
          error: "The Kindwise API quota or rate limit has been reached. Try again later.",
        });
      }
      return res.status(502).json({
        error: `Kindwise diagnosis failed: ${providerMessage}`,
      });
    }

    const result = payload?.result;
    if (!result) {
      console.error("Kindwise returned an unexpected response:", payload);
      return res.status(502).json({
        error: "Kindwise returned an incomplete diagnosis. Please try again.",
      });
    }
    if (result.is_plant?.binary === false) {
      return res.status(422).json({
        error: "No plant leaf was detected in the image. Try a clear, close-up leaf photo.",
      });
    }

    const plantSuggestion = result.classification?.suggestions?.[0];
    const diseaseSuggestion = result.disease?.suggestions
      ?.filter((suggestion) => !suggestion.redundant)
      .sort((a, b) => b.probability - a.probability)[0];
    const healthy = result.is_healthy?.binary === true;
    const diseaseDetails = diseaseSuggestion?.details ?? {};
    const treatmentDetails = diseaseDetails.treatment ?? {};
    const preventionTips = getTextItems(treatmentDetails.prevention);
    const treatments = [
      ...getTextItems(treatmentDetails.biological),
      ...getTextItems(treatmentDetails.chemical),
    ];
    const confidence =
      (healthy ? result.is_healthy?.probability : diseaseSuggestion?.probability) ??
      (healthy ? plantSuggestion?.probability : undefined);

    return res.json({
      plantName: plantSuggestion?.name ?? "Plant identified",
      healthStatus: healthy
        ? "Healthy"
        : diseaseSuggestion?.name ?? "Disease detected",
      confidence:
        typeof confidence === "number" ? Math.round(confidence * 100) : undefined,
      symptoms: diseaseDetails.description ? [diseaseDetails.description] : [],
      causes: diseaseDetails.cause,
      treatments,
      preventionTips,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "Kindwise diagnosis timed out. Try a smaller, clearer leaf photo and submit again.",
      });
    }
    console.error("Kindwise diagnosis error:", error);
    return res.status(502).json({
      error:
        error instanceof Error
          ? `Could not complete the Kindwise diagnosis: ${error.message}`
          : "Could not complete the Kindwise diagnosis.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`AgriScan server running on port ${PORT}`));
