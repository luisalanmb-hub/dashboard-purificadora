const express = require('express');
const cors = require('cors');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURACIÓN DE ACCESO
const USUARIO_VALIDO = 'lioma';
const PASSWORD_VALIDO = 'perrixkya';

// Middleware de autenticación Basic Auth
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Acceso Protegido - Purificadora"');
    return res.status(401).send('Acceso denegado: Se requiere autenticación.');
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const usuario = auth[0];
  const password = auth[1];

  if (usuario === USUARIO_VALIDO && password === PASSWORD_VALIDO) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Acceso Protegido - Purificadora"');
    return res.status(401).send('Credenciales incorrectas.');
  }
});

// Servir archivos estáticos tras validar usuario
app.use(express.static(path.join(__dirname)));

let db;

async function inicializarBD() {
  db = await open({
    filename: './purificadora.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ventas_diarias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATE UNIQUE,
      garrafon_grande INTEGER NOT NULL,
      garrafon_chico INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Base de datos purificadora.db conectada correctamente.");
}

inicializarBD();

// Registrar o actualizar ventas
app.post('/api/ventas', async (req, res) => {
  const { fecha, garrafonGrande, garrafonChico } = req.body;

  if (!fecha || garrafonGrande === undefined || garrafonChico === undefined) {
    return res.status(400).json({ error: "Todos los campos son requeridos" });
  }

  try {
    await db.run(
      `INSERT INTO ventas_diarias (fecha, garrafon_grande, garrafon_chico)
       VALUES (?, ?, ?)
       ON CONFLICT(fecha) DO UPDATE SET
         garrafon_grande = excluded.garrafon_grande,
         garrafon_chico = excluded.garrafon_chico`,
      [fecha, garrafonGrande, garrafonChico]
    );

    res.json({ mensaje: "Registro guardado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar en la base de datos" });
  }
});

// Reportes avanzados (Garrafones Grandes)
app.get('/api/reportes-avanzados', async (req, res) => {
  try {
    const historial = await db.all('SELECT * FROM ventas_diarias ORDER BY fecha DESC');

    const generales = await db.get(`
      SELECT 
        SUM(garrafon_grande) as total_grandes,
        AVG(garrafon_grande) as promedio_diario_grande,
        COUNT(id) as dias_registrados
      FROM ventas_diarias
    `);

    const porDiaSemana = await db.all(`
      SELECT 
        strftime('%w', fecha) as dia_num,
        CASE strftime('%w', fecha)
          WHEN '0' THEN 'Domingo'
          WHEN '1' THEN 'Lunes'
          WHEN '2' THEN 'Martes'
          WHEN '3' THEN 'Miércoles'
          WHEN '4' THEN 'Jueves'
          WHEN '5' THEN 'Viernes'
          WHEN '6' THEN 'Sábado'
        END as nombre_dia,
        AVG(garrafon_grande) as promedio_ventas,
        SUM(garrafon_grande) as total_ventas
      FROM ventas_diarias
      GROUP BY dia_num
      ORDER BY promedio_ventas DESC
    `);

    const promedioDiarioGrande = generales.promedio_diario_grande || 0;
    const proyeccion7Dias = Math.round(promedioDiarioGrande * 7);

    res.json({
      historial,
      generales,
      mejoresDias: porDiaSemana,
      proyeccion: {
        estimadoSemanal: proyeccion7Dias,
        promedioDiario: Math.round(promedioDiarioGrande)
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al generar reportes avanzados" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Activo en el puerto ${PORT}`);
});
