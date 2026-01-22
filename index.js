const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

// DATABASE CONNECTION
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "credential_store",
  password: "4CmCwRHS",
  port: 5432
});

// ENCRYPTION SETUP
const SECRET_KEY = crypto
  .createHash("sha256")
  .update("my_secret_key")
  .digest()
  .slice(0, 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  const [iv, encrypted] = text.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    SECRET_KEY,
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// IMPORT CSV ENDPOINT
app.get("/import", (req, res) => {
  const rows = [];

  const path = require("path");

const csvPath = path.join(__dirname, "credentials.csv");

fs.createReadStream(csvPath)

    .pipe(csv())
    .on("data", row => rows.push(row))
    .on("end", async () => {
      try {
        for (let r of rows) {
          await pool.query(
            "INSERT INTO credentials(url, username, password_encrypted) VALUES ($1,$2,$3)",
            [r.url, r.username, encrypt(r.password)]
          );
        }
        res.json({ message: "CSV imported successfully" });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
});

// SEARCH ENDPOINT
app.get("/search", async (req, res) => {
  const q = req.query.q;

  const result = await pool.query(
    "SELECT url, username, password_encrypted FROM credentials WHERE url ILIKE $1 OR username ILIKE $1",
    [`%${q}%`]
  );

  const data = result.rows.map(r => ({
    url: r.url,
    username: r.username,
    password: decrypt(r.password_encrypted)
  }));

  res.json(data);
});

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
