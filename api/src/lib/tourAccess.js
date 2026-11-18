import { pool } from '../db/client.js';
import { wrap } from './wrap.js';

// M8 (A01): ägarkontroll mot databasraden, inte mot något klienten skickar. Hämtar turen,
// svarar 404 om den saknas och 403 om användaren varken äger den eller är redaktör.
// Körs efter requireUser. Läggs på req.tour så att routen inte hämtar den igen.
// getId plockar id ur requesten (req.params.id eller req.body.tourId).
export const requireTourAccess = (getId) =>
  wrap(async (req, res, next) => {
    const { rows } = await pool.query('select * from tours where id = $1', [getId(req)]);
    const tour = rows[0];
    if (!tour) return res.status(404).json({ error: 'hittades inte' });
    if (tour.user_id !== req.user.id && req.user.role !== 'editor') {
      return res.status(403).json({ error: 'du får bara ändra dina egna turer' });
    }
    req.tour = tour;
    next();
  });
