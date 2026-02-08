const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware - Increased limit for bulk imports
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// --- Database Connection (MySQL 8.4 Optimized) ---

// Validar que existan las credenciales
if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
    console.error("❌ ERROR FATAL: No se detectaron variables de entorno para MySQL.");
    console.error("   Asegúrate de tener DB_HOST, DB_USER, DB_PASS y DB_NAME configurados.");
    process.exit(1); // Detener la app si no hay DB configurada
}

let sequelize;

const dbConfig = {
    dialect: 'mysql',
    logging: false, // Set to console.log to debug SQL
    define: {
        // MySQL 8.4 Best Practice: Full Unicode Support
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        timestamps: true
    },
    pool: {
        max: 20, // Manejo de concurrencia para múltiples usuarios
        min: 0,
        acquire: 60000,
        idle: 10000
    },
    dialectOptions: {
        // Soporte para fechas como strings si es necesario y manejo de decimales
        decimalNumbers: true,
        // Configuración SSL opcional para nubes como Azure/AWS/GCP
        ssl: process.env.DB_SSL === 'true' ? {
            require: true,
            rejectUnauthorized: false
        } : undefined
    }
};

if (process.env.DB_HOST) {
    // Opción 1: Variables individuales
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        {
            ...dbConfig,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
        }
    );
} else {
    // Opción 2: Connection String
    sequelize = new Sequelize(process.env.DATABASE_URL, dbConfig);
}

// --- Models ---

const Doctor = sequelize.define('Doctor', {
    id: {
        type: DataTypes.STRING(255), // 255 es el límite seguro para índices en utf8mb4
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
}, {
    indexes: [
        { fields: ['executive'] },
        { fields: ['name'] }
    ]
});

const Procedure = sequelize.define('Procedure', {
    id: {
        type: DataTypes.STRING(255),
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
}, {
    indexes: [
        { fields: ['date'] },
        { fields: ['doctorId'] }
    ]
});

// Sync DB
sequelize.sync({ alter: true })
    .then(() => console.log("✅ MySQL 8.4 Conectado y Sincronizado."))
    .catch(err => {
        console.error("❌ Error conectando a MySQL:", err);
    });

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
        // Upsert simple para registro individual
        await Doctor.upsert(data);
        // Devolvemos el registro actualizado
        const result = await Doctor.findByPk(data.id);
        res.json(result);
    } catch (error) {
        console.error("Error SAVE doctor:", error);
        res.status(500).json({ error: error.message });
    }
});

// Optimized Bulk Import for MySQL 8.4
app.post('/api/doctors/bulk', async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Data must be an array" });
    }
    
    console.log(`📥 Importando lote de ${data.length} registros a MySQL...`);

    // MySQL maneja bien lotes grandes, pero dividimos por seguridad de memoria en Node
    const CHUNK_SIZE = 1000; 
    let processed = 0;

    try {
        await sequelize.transaction(async (t) => {
            for (let i = 0; i < data.length; i += CHUNK_SIZE) {
                const chunk = data.slice(i, i + CHUNK_SIZE);
                
                // CRUCIAL: Usamos updateOnDuplicate para evitar errores de llave duplicada
                // y para NO SOBREESCRIBIR 'visits' ni 'schedule' si el médico ya existe.
                await Doctor.bulkCreate(chunk, {
                    transaction: t,
                    validate: true,
                    updateOnDuplicate: [
                        'category', 'executive', 'name', 'specialty', 
                        'subSpecialty', 'address', 'hospital', 'area', 
                        'phone', 'email', 'floor', 'officeNumber', 
                        'birthDate', 'cedula', 'classification', 
                        'importantNotes', 'isInsuranceDoctor', 'updatedAt'
                        // NOTA: 'visits' y 'schedule' NO están aquí, por lo que se preservan.
                    ]
                });
                processed += chunk.length;
            }
        });
        
        console.log("✅ Importación completada.");
        res.json({ success: true, count: processed });
    } catch (error) {
        console.error("❌ Error Importación MySQL:", error);
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
            // MySQL a veces devuelve JSON como string dependiendo de la versión/driver
            if (typeof visits === 'string') visits = JSON.parse(visits);
            
            doctor.visits = visits.filter(v => v.id !== visitId);
            doctor.changed('visits', true); // Forzar detección de cambio en JSON
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