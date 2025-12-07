
import crypto from "crypto";

export const generateApiKey = () => {
  return "API_" + crypto.randomBytes(16).toString("hex");
};

export const generateSecretKey = () => {
  return "SECRET_" + crypto.randomBytes(32).toString("hex");
};
