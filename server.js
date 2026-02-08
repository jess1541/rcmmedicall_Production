const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware - Increased limit for bulk imports
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// --- Database Connection ---
const isProduction = !!process.env.DATABASE_URL;

const sequelize = isProduction
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false, // Set to console.log to debug SQL queries
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false 
            }
        },
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
      })
    : new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite',
        logging: false,
        retry: { match: [/SQLITE_BUSY/], max: 10 }
      });

// --- Models ---

const Doctor = sequelize.define('Doctor', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    category: { type: DataTypes.STRING, defaultValue: 'MEDICO' },
    executive: { type: DataTypes.STRING, defaultValue: 'SIN ASIGNAR' },
    name: { type: DataTypes.STRING, allowNull: false },
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
    profile: DataTypes.TEXT,
    classification: DataTypes.STRING,
    socialStyle: DataTypes.STRING,
    attitudinalSegment: DataTypes.STRING,
    importantNotes: DataTypes.TEXT,
    isInsuranceDoctor: { type: DataTypes.BOOLEAN, defaultValue: false },
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

// Sync DB
sequelize.sync({ alter: true })
    .then(() => console.log("✅ Base de Datos Sincronizada"))
    .catch(err => console.error("❌ Error DB:", err));

// --- API Routes ---

app.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await Doctor.findAll();
        res.json(doctors);
    } catch (error) {
        console.error("Error GET doctors:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/doctors', async (req, res) => {
    const data = req.body;
    try {
        await Doctor.upsert(data);
        const result = await Doctor.findByPk(data.id);
        res.json(result);
    } catch (error) {
        console.error("Error SAVE doctor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Optimized Bulk Import for PostgreSQL
app.post('/api/doctors/bulk', async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Data must be an array" });
    }
    
    console.log(`📥 Iniciando importación de ${data.length} registros...`);

    // PostgreSQL parameter limit workaround: Process in chunks
    const CHUNK_SIZE = 500; 
    let processed = 0;

    try {
        await sequelize.transaction(async (t) => {
            // Eliminar registros previos si es una carga full (Opcional, aquí solo insertamos)
            // Si se desea limpiar la base antes: await Doctor.destroy({ where: {}, transaction: t });

            for (let i = 0; i < data.length; i += CHUNK_SIZE) {
                const chunk = data.slice(i, i + CHUNK_SIZE);
                await Doctor.bulkCreate(chunk, {
                    transaction: t,
                    validate: true,
                    // updateOnDuplicate is not fully supported in standard Sequelize bulkCreate for Postgres without specific options
                    // Since we generate unique IDs on frontend import, simple INSERT is safer and faster.
                    ignoreDuplicates: true 
                });
                processed += chunk.length;
                console.log(`   ↳ Procesado lote ${i} - ${i + chunk.length}`);
            }
        });
        
        console.log("✅ Importación completada exitosamente.");
        res.json({ success: true, count: processed });
    } catch (error) {
        console.error("❌ Error Importación Masiva:", error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/doctors/:id', async (req, res) => {
    try {
        await Doctor.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/doctors/:doctorId/visits/:visitId', async (req, res) => {
    const { doctorId, visitId } = req.params;
    try {
        const doctor = await Doctor.findByPk(doctorId);
        if (doctor) {
            let visits = doctor.visits || [];
            // Ensure visits is an array
            if (typeof visits === 'string') visits = JSON.parse(visits);
            
            doctor.visits = visits.filter(v => v.id !== visitId);
            doctor.changed('visits', true);
            await doctor.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Doctor not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/procedures', async (req, res) => {
    try {
        const procedures = await Procedure.findAll();
        res.json(procedures);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/procedures', async (req, res) => {
    try {
        await Procedure.upsert(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/procedures/:id', async (req, res) => {
    try {
        await Procedure.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Static Files
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on ${PORT}`));