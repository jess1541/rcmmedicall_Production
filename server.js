const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware - Increased limit for bulk imports (50mb is usually enough for ~50k rows)
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// --- Database Connection (Sequelize) ---
// Si existe DATABASE_URL, usa Postgres (Producción). Si no, usa SQLite local.
const isProduction = !!process.env.DATABASE_URL;

const sequelize = isProduction
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false 
            }
        }
      })
    : new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite', // Archivo local
        logging: false
      });

// --- Models Definition ---

// Usamos columnas JSON para 'visits' y 'schedule' para mantener compatibilidad 
// total con el Frontend sin tener que reescribir toda la lógica relacional.

const Doctor = sequelize.define('Doctor', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    category: { type: DataTypes.STRING, defaultValue: 'MEDICO' },
    executive: DataTypes.STRING,
    name: DataTypes.STRING,
    specialty: DataTypes.STRING,
    subSpecialty: DataTypes.STRING,
    address: DataTypes.TEXT,
    hospital: DataTypes.STRING,
    area: DataTypes.STRING,
    phone: DataTypes.STRING,
    email: DataTypes.STRING,
    floor: DataTypes.STRING,
    officeNumber: DataTypes.STRING,
    birthDate: DataTypes.STRING,
    cedula: DataTypes.STRING,
    profile: DataTypes.TEXT, // Descripción larga
    classification: DataTypes.STRING,
    socialStyle: DataTypes.STRING,
    attitudinalSegment: DataTypes.STRING,
    importantNotes: DataTypes.TEXT,
    isInsuranceDoctor: { type: DataTypes.BOOLEAN, defaultValue: false },
    // Guardamos las visitas y horario como JSON para imitar la estructura NoSQL
    visits: { 
        type: DataTypes.JSON, 
        defaultValue: [] 
    },
    schedule: { 
        type: DataTypes.JSON, 
        defaultValue: [] 
    }
});

const Procedure = sequelize.define('Procedure', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    date: DataTypes.STRING,
    time: DataTypes.STRING,
    hospital: DataTypes.STRING,
    doctorId: DataTypes.STRING,
    doctorName: DataTypes.STRING,
    procedureType: DataTypes.STRING,
    paymentType: DataTypes.STRING,
    cost: DataTypes.FLOAT,
    commission: DataTypes.FLOAT,
    technician: DataTypes.STRING,
    notes: DataTypes.TEXT,
    status: DataTypes.STRING
});

// Sincronizar base de datos
// 'alter: true' es CRÍTICO: actualiza las tablas si añades columnas nuevas sin borrar datos.
sequelize.sync({ alter: true })
    .then(() => console.log(isProduction ? "✅ PostgreSQL Conectado (Schema Synced)" : "✅ SQLite Local Conectado (Schema Synced)"))
    .catch(err => console.error("❌ Error de Base de Datos:", err));

// --- API Routes ---

// GET: Obtener todos los doctores
app.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await Doctor.findAll();
        res.json(doctors);
    } catch (error) {
        console.error("Error fetching doctors:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear o Actualizar Doctor (Individual)
app.post('/api/doctors', async (req, res) => {
    const data = req.body;
    try {
        // Upsert en Sequelize
        await Doctor.upsert(data);
        const result = await Doctor.findByPk(data.id);
        res.json(result);
    } catch (error) {
        console.error("Error saving doctor:", error);
        res.status(500).json({ error: error.message });
    }
});

// POST: Carga Masiva de Doctores (Bulk Upsert)
app.post('/api/doctors/bulk', async (req, res) => {
    const data = req.body; // Array of doctors
    if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Se esperaba un arreglo de datos." });
    }
    
    console.log(`📥 Recibiendo solicitud masiva para ${data.length} registros...`);

    try {
        // Transaction asegura que o se guardan todos o ninguno
        await sequelize.transaction(async (t) => {
            // Usamos bulkCreate con updateOnDuplicate para manejar inserts y updates eficientemente
            await Doctor.bulkCreate(data, {
                updateOnDuplicate: [
                    'category', 'executive', 'name', 'specialty', 'subSpecialty', 
                    'address', 'hospital', 'area', 'phone', 'email', 'floor', 
                    'officeNumber', 'importantNotes', 'updatedAt'
                ],
                transaction: t
            });
        });
        
        console.log("✅ Importación masiva completada exitosamente.");
        res.json({ success: true, count: data.length, message: "Importación masiva completada." });
    } catch (error) {
        console.error("❌ Bulk Insert Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Eliminar Doctor
app.delete('/api/doctors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await Doctor.destroy({ where: { id } });
        if (result > 0) {
            res.status(200).json({ success: true, message: "Registro eliminado." });
        } else {
            res.status(404).json({ success: false, message: "No encontrado." });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE VISIT (Manipulación del JSON Array)
app.delete('/api/doctors/:doctorId/visits/:visitId', async (req, res) => {
    const { doctorId, visitId } = req.params;
    try {
        const doctor = await Doctor.findByPk(doctorId);
        if (!doctor) {
            return res.status(404).json({ success: false, message: "Doctor no encontrado" });
        }

        // Filtramos el array de visitas en memoria
        const currentVisits = doctor.visits || [];
        const updatedVisits = currentVisits.filter(v => v.id !== visitId);

        // Actualizamos y guardamos
        doctor.visits = updatedVisits;
        
        // Importante para Sequelize: avisar que el campo JSON cambió
        doctor.changed('visits', true); 
        await doctor.save();

        res.json({ success: true, result: doctor });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET Procedures
app.get('/api/procedures', async (req, res) => {
    try {
        const procedures = await Procedure.findAll();
        res.json(procedures);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST Procedure
app.post('/api/procedures', async (req, res) => {
    const data = req.body;
    try {
        await Procedure.upsert(data);
        const result = await Procedure.findByPk(data.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE Procedure
app.delete('/api/procedures/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await Procedure.destroy({ where: { id } });
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- SERVING STATIC FILES (REACT) ---
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Servidor SQL corriendo en puerto ${PORT}`);
});