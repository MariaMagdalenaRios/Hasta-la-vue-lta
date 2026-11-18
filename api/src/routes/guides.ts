import { Router } from "express";
import type { Request, Response } from "express";
import type { Guide } from "@utpost/shared";
import { pool } from "../db/client.js";
import { validate } from "../lib/validate.js";
import { searchSchema } from "../lib/schemas.js";
import { wrap } from "../lib/wrap.js";
import { requireUser, requireRole } from "../lib/auth.js";

export const guidesRouter = Router();

guidesRouter.get("/", wrap(async (req: Request, res: Response<Guide[]>) => {
  const result = await pool.query<Guide[]>(
    "select * from guides order by updated_at desc",
  );
  res.json(result.rows);
}));

guidesRouter.get("/regions", wrap(async (req: Request, res: Response) => {
  const result = await pool.query(
    "select distinct region from guides order by region",
  );
  res.json(result.rows.map((row: { region: string }) => row.region));
}));

guidesRouter.get("/popular", wrap(async (req: Request, res: Response) => {
  const result = await pool.query(
    "select * from guides where published = true order by id desc limit 6",
  );
  res.json(result.rows);
}));

// Sök med servervalidering och parametriserad SQL.
guidesRouter.get(
  "/search",
  validate(searchSchema, "query"),
  wrap(async (req: Request, res: Response) => {
    const { q } = (req as typeof req & { validQuery: { q: string } }).validQuery;
    const result = await pool.query(
      "select * from guides where title ilike $1 or region ilike $1",
      [`%${q}%`],
    );
    res.json(result.rows);
  }),
);

guidesRouter.get("/:slug", wrap(async (req: Request, res: Response) => {
  const result = await pool.query("select * from guides where slug = $1", [
    req.params.slug,
  ]);
  if (!result.rows[0]) return res.status(404).json({ error: "hittades inte" });
  res.json(result.rows[0]);
}));

// Redigering är redaktionens: inloggning (401) och rollen editor (403) kontrolleras innan routen körs.
guidesRouter.put(
  "/:id",
  requireUser,
  requireRole("editor"),
  wrap(async (req: Request, res: Response) => {
    const { title, region, difficulty, lengthKm, bodyHtml, published } = req.body;
    const result = await pool.query(
      `update guides set title=$1, region=$2, difficulty=$3, length_km=$4, body_html=$5,
       published=$6, updated_at=now() where id=$7 returning *`,
      [title, region, difficulty, lengthKm, bodyHtml, published, req.params.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "hittades inte" });
    res.json(result.rows[0]);
  }),
);
