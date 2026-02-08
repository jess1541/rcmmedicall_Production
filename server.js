const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. Middleware (Must be defined before routes)
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// 2. Inicialización Robusta de Base de Datos
let sequelize = null;
let Doctor = null;
let Procedure = null;

const initializeDatabase = async () => {
    try {
        const hasMySQL = process.env.DB_SOCKET_PATH || process.env.DB_HOST || process.env.DATABASE_URL;
        
        if (hasMySQL) {
            console.log("🔌 Conectando a MySQL...");
            const dbConfig = {
                dialect: 'mysql',
                logging: false,
                define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', timestamps: true },
                pool: { max: 20, min: 0, acquire: 60000, idle: 10000 },
                dialectOptions: { 
                    decimalNumbers: true,
                    charset: 'utf8mb4', 
                    ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : undefined 
                }
            };
            
            if (process.env.DB_SOCKET_PATH) {
                console.log(`   > Modo: Unix Socket (${process.env.DB_SOCKET_PATH})`);
                dbConfig.dialectOptions.socketPath = process.env.DB_SOCKET_PATH;
                if (process.env.DB_SSL !== 'true') delete dbConfig.dialectOptions.ssl;

                sequelize = new Sequelize(
                    process.env.DB_NAME, 
                    process.env.DB_USER, 
                    process.env.DB_PASS, 
                    { ...dbConfig, host: 'localhost' }
                );
            } else if (process.env.DB_HOST) {
                console.log(`   > Modo: TCP (${process.env.DB_HOST})`);
                sequelize = new Sequelize(
                    process.env.DB_NAME, 
                    process.env.DB_USER, 
                    process.env.DB_PASS, 
                    { ...dbConfig, host: process.env.DB_HOST, port: process.env.DB_PORT || 3306 }
                );
            } else {
                sequelize = new Sequelize(process.env.DATABASE_URL, dbConfig);
            }
        } else {
            console.warn("⚠️ Usando SQLite (Modo Fallback/Demo).");
            sequelize = new Sequelize({ 
                dialect: 'sqlite', 
                storage: './database.sqlite', 
                logging: false 
            });
        }

        // Definición de Modelos
        Doctor = sequelize.define('Doctor', {
            id: { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },
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
            visits: { type: DataTypes.JSON, defaultValue: [] },
            schedule: { type: DataTypes.JSON, defaultValue: [] }
        }, { indexes: [{ fields: ['executive'] }, { fields: ['name'] }] });

        Procedure = sequelize.define('Procedure', {
            id: { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },
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
        }, { indexes: [{ fields: ['date'] }, { fields: ['doctorId'] }] });

        await sequelize.sync({ alter: true });
        console.log("✅ Base de datos sincronizada correctamente.");

    } catch (error) {
        console.error("❌ Error CRÍTICO inicializando Base de Datos:", error);
        sequelize = null; 
    }
};

initializeDatabase();

// 3. Middleware de seguridad
const ensureDB = (req, res, next) => {
    if (!sequelize || !Doctor || !Procedure) {
        return res.status(503).json({ error: "Base de datos no disponible. Intente más tarde." });
    }
    next();
};

// 4. Rutas de API
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/api/sync-status', ensureDB, async (req, res) => {
    try {
        const lastDoctor = await Doctor.findOne({ order: [['updatedAt', 'DESC']], attributes: ['updatedAt'] });
        const lastProcedure = await Procedure.findOne({ order: [['updatedAt', 'DESC']], attributes: ['updatedAt'] });
        
        res.json({
            doctorsVersion: lastDoctor ? lastDoctor.updatedAt : 0,
            proceduresVersion: lastProcedure ? lastProcedure.updatedAt : 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/doctors', ensureDB, async (req, res) => {
    try {
        const doctors = await Doctor.findAll();
        res.json(doctors);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/doctors', ensureDB, async (req, res) => {
    try {
        await Doctor.upsert(req.body);
        const result = await Doctor.findByPk(req.body.id);
        res.json(result);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/doctors/bulk', ensureDB, async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: "Data must be an array" });
    const CHUNK_SIZE = 500; 
    try {
        await sequelize.transaction(async (t) => {
            for (let i = 0; i < data.length; i += CHUNK_SIZE) {
                const chunk = data.slice(i, i + CHUNK_SIZE);
                await Doctor.bulkCreate(chunk, {
                    transaction: t,
                    validate: true,
                    updateOnDuplicate: [
                        'category', 'executive', 'name', 'specialty', 'subSpecialty', 
                        'address', 'hospital', 'area', 'phone', 'email', 'floor', 
                        'officeNumber', 'birthDate', 'cedula', 'classification', 
                        'profile', 'socialStyle', 'attitudinalSegment',
                        'importantNotes', 'isInsuranceDoctor', 'visits', 'schedule', 'updatedAt'
                    ]
                });
            }
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/doctors/:id', ensureDB, async (req, res) => {
    try {
        await Doctor.destroy({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/doctors/:doctorId/visits/:visitId', ensureDB, async (req, res) => {
    try {
        const doctor = await Doctor.findByPk(req.params.doctorId);
        if (doctor) {
            let visits = doctor.visits || [];
            if (typeof visits === 'string') {
                try { visits = JSON.parse(visits); } catch (e) { visits = []; }
            }
            const newVisits = visits.filter(v => v.id !== req.params.visitId);
            
            await Doctor.update(
                { visits: newVisits },
                { where: { id: req.params.doctorId } }
            );
            res.json({ success: true });
        } else { res.status(404).json({ error: "Doctor not found" }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/procedures', ensureDB, async (req, res) => {
    try { const p = await Procedure.findAll(); res.json(p); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/procedures', ensureDB, async (req, res) => {
    try { await Procedure.upsert(req.body); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/procedures/:id', ensureDB, async (req, res) => {
    try { await Procedure.destroy({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Archivos Estáticos
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send(`
            <h1>CRM Backend Activo</h1>
            <p>DB Status: ${sequelize ? 'Conectado ✅' : 'Desconectado ❌'}</p>
        `);
    }
});

// 6. Start Server (LAST STEP)
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));