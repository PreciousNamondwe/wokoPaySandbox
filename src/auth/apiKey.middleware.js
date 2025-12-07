// apikey.middleware.js
import { supabase } from "../supabase/client.js";

export const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    // accept both x-secret-key and x-api-secret for flexibility
    const secretKey =
      req.headers["x-secret-key"] ||
      req.headers["x-api-secret"];

    if (!apiKey || !secretKey) {
      return res.status(401).json({
        success: false,
        error: "Missing API key or secret key"
      });
    }

    const { data: dev, error } = await supabase
      .from("developers")
      .select("*")
      .eq("api_key", apiKey)
      .eq("secret_key", secretKey)
      .single();

    if (error || !dev) {
      return res.status(403).json({
        success: false,
        error: "Invalid API key or secret key"
      });
    }

    req.developer = dev;
    next();

  } catch (err) {
    console.error("API KEY VALIDATION ERROR:", err);
    res.status(500).json({
      success: false,
      error: "API key verification failed"
    });
  }
};
