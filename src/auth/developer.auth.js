import bcrypt from "bcryptjs";
import { supabase } from "../supabase/client.js";
import { generateApiKey, generateSecretKey } from "./keygen.js";

export const registerDeveloper = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const apiKey = generateApiKey();
    const secretKey = generateSecretKey();

    const { data, error } = await supabase
      .from("developers")
      .insert([
        {
          username,
          email,
          password_hash: passwordHash,
          api_key: apiKey,
          secret_key: secretKey
        }
      ])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.status(201).json({
      message: "Developer registered successfully",
      developer: {
        id: data.id,
        username: data.username,
        email: data.email,
        api_key: data.api_key,
        secret_key: data.secret_key
      }
    });
  } catch (e) {
    console.error("Registration error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

export const loginDeveloper = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: dev, error } = await supabase
      .from("developers")
      .select()
      .eq("email", email)
      .single();

    if (error || !dev) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, dev.password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    return res.json({
      message: "Login successful",
      developer: {
        id: dev.id,
        username: dev.username,
        email: dev.email,
        api_key: dev.api_key,
        secret_key: dev.secret_key
      }
    });
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};

export const rotateKeys = async (req, res) => {
  try {
    const { developer_id } = req.body;

    const newApiKey = generateApiKey();
    const newSecretKey = generateSecretKey();

    const { data, error } = await supabase
      .from("developers")
      .update({
        api_key: newApiKey,
        secret_key: newSecretKey
      })
      .eq("id", developer_id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    return res.json({
      message: "Keys rotated successfully",
      api_key: data.api_key,
      secret_key: data.secret_key
    });
  } catch (e) {
    console.error("Key rotation error:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
