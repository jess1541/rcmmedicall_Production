const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. Iniciar servidor INMEDIATAMENTE para satisfacer el Health Check de Cloud Run
// Esto evita el error "Container failed to start" si la DB tarda en conectar.
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));

// 2. Health Check explícito
app.get('/health', (req, res) => res.status(200).send('OK'));

// 3. Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// 4. Inicialización Robusta de Base de Datos
let sequelize = null;
let Doctor = null;
let Procedure = null;

const initializeDatabase = async () => {
    try {
        // Se agrega verificación de DB_SOCKET_PATH
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
                    ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : undefined 
                }
            };
            
            if (process.env.DB_SOCKET_PATH) {
                // Conexión vía Unix Socket (Recomendado para Cloud Run -> Cloud SQL)
                console.log(`   > Modo: Unix Socket (${process.env.DB_SOCKET_PATH})`);
                dbConfig.dialectOptions.socketPath = process.env.DB_SOCKET_PATH;
                // Generalmente no se requiere configuración SSL explícita al usar el socket de Cloud SQL
                if (process.env.DB_SSL !== 'true') delete dbConfig.dialectOptions.ssl;

                sequelize = new Sequelize(
                    process.env.DB_NAME, 
                    process.env.DB_USER, 
                    process.env.DB_PASS, 
                    { ...dbConfig, host: 'localhost' } // Host es ignorado cuando se usa socketPath
                );
            } else if (process.env.DB_HOST) {
                // Conexión TCP Estándar
                console.log(`   > Modo: TCP (${process.env.DB_HOST})`);
                sequelize = new Sequelize(
                    process.env.DB_NAME, 
                    process.env.DB_USER, 
                    process.env.DB_PASS, 
                    { ...dbConfig, host: process.env.DB_HOST, port: process.env.DB_PORT || 3306 }
                );
            } else {
                // Cadena de conexión directa
                sequelize = new Sequelize(process.env.DATABASE_URL, dbConfig);
            }
        } else {
            console.warn("⚠️ No se detectó MySQL (DB_SOCKET_PATH, DB_HOST o DATABASE_URL).");
            console.warn("⚠️ Usando SQLite (Modo Fallback/Demo).");
            console.warn("   Nota: Los datos en SQLite son temporales en Cloud Run.");
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
        // IMPORTANTE: No hacemos process.exit(1) para que el servidor siga vivo 
        // y se pueda diagnosticar el error leyendo los logs, o servir el frontend estático.
        sequelize = null; 
    }
};

// Iniciar conexión DB en segundo plano
initializeDatabase();

// 5. Middleware de seguridad para endpoints
const ensureDB = (req, res, next) => {
    if (!sequelize || !Doctor || !Procedure) {
        return res.status(503).json({ error: "El sistema está inicializando la base de datos o hubo un error de conexión. Intente en unos segundos." });
    }
    next();
};

// 6. Rutas de API
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
    const CHUNK_SIZE = 1000; 
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
                        'importantNotes', 'isInsuranceDoctor', 'updatedAt'
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
            if (typeof visits === 'string') visits = JSON.parse(visits);
            doctor.visits = visits.filter(v => v.id !== req.params.visitId);
            doctor.changed('visits', true);
            await doctor.save();
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

// 7. Archivos Estáticos (Frontend)
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send(`
            <h1>Iniciando Sistema CRM...</h1>
            <p>Si ve esto, el servidor backend está activo pero el frontend no se ha compilado o copiado a 'dist'.</p>
            <p>Estado de DB: ${sequelize ? 'Conectada ✅' : 'Inicializando o Fallida ⏳'}</p>
        `);
    }
});