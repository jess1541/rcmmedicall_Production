
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Configuración de MySQL (Ajustar con tus credenciales locales)
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'Medicall2026!', // Cambiar por tu contraseña
    database: 'rc-medicall-db',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function initDB() {
    try {
        // Crear la conexión inicial para asegurar que la DB existe
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database};`);
        await connection.end();

        // Crear el pool de conexiones
        pool = mysql.createPool(dbConfig);

        // Tabla de Doctores (con soporte JSON para visits y schedule)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS doctors (
                id VARCHAR(100) PRIMARY KEY,
                category VARCHAR(50) DEFAULT 'MEDICO',
                executive VARCHAR(100),
                name VARCHAR(255),
                specialty VARCHAR(255),
                subSpecialty VARCHAR(255),
                address TEXT,
                hospital VARCHAR(255),
                area VARCHAR(100),
                phone VARCHAR(50),
                email VARCHAR(150),
                floor VARCHAR(20),
                officeNumber VARCHAR(20),
                birthDate VARCHAR(20),
                cedula VARCHAR(50),
                classification VARCHAR(5),
                socialStyle VARCHAR(50),
                attitudinalSegment VARCHAR(100),
                importantNotes TEXT,
                isInsuranceDoctor BOOLEAN DEFAULT FALSE,
                visits JSON,
                schedule JSON,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Tabla de Procedimientos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS procedures (
                id VARCHAR(100) PRIMARY KEY,
                date DATE,
                time VARCHAR(10),
                hospital VARCHAR(255),
                doctorId VARCHAR(100),
                doctorName VARCHAR(255),
                procedureType VARCHAR(255),
                paymentType VARCHAR(50),
                cost DECIMAL(15, 2),
                commission DECIMAL(15, 2),
                technician VARCHAR(255),
                notes TEXT,
                status VARCHAR(50),
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (doctorId)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log("✅ MySQL 8.4 Conectado y Tablas Sincronizadas.");
    } catch (err) {
        console.error("❌ Error en MySQL init:", err.message);
    }
}

initDB();

// --- API ROUTES ---

// GET: Obtener todos los doctores
app.get('/api/doctors', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM doctors");
        // MySQL devuelve los campos JSON como objetos si el driver está bien configurado, 
        // pero por seguridad mapeamos
        const doctors = rows.map(row => ({
            ...row,
            isInsuranceDoctor: !!row.isInsuranceDoctor,
            visits: typeof row.visits === 'string' ? JSON.parse(row.visits) : (row.visits || []),
            schedule: typeof row.schedule === 'string' ? JSON.parse(row.schedule) : (row.schedule || [])
        }));
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST: Crear o Actualizar Doctor (Upsert)
app.post('/api/doctors', async (req, res) => {
    const d = req.body;
    try {
        const query = `
            INSERT INTO doctors (
                id, category, executive, name, specialty, subSpecialty, address, 
                hospital, area, phone, email, floor, officeNumber, birthDate, 
                cedula, classification, socialStyle, attitudinalSegment, 
                importantNotes, isInsuranceDoctor, visits, schedule
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                category=VALUES(category), executive=VALUES(executive), name=VALUES(name),
                specialty=VALUES(specialty), subSpecialty=VALUES(subSpecialty), address=VALUES(address),
                hospital=VALUES(hospital), area=VALUES(area), phone=VALUES(phone),
                email=VALUES(email), floor=VALUES(floor), officeNumber=VALUES(officeNumber),
                birthDate=VALUES(birthDate), cedula=VALUES(cedula), classification=VALUES(classification),
                socialStyle=VALUES(socialStyle), attitudinalSegment=VALUES(attitudinalSegment),
                importantNotes=VALUES(importantNotes), isInsuranceDoctor=VALUES(isInsuranceDoctor),
                visits=VALUES(visits), schedule=VALUES(schedule)
        `;

        await pool.execute(query, [
            d.id, d.category || 'MEDICO', d.executive, d.name, d.specialty, d.subSpecialty, d.address,
            d.hospital, d.area, d.phone, d.email, d.floor, d.officeNumber, d.birthDate,
            d.cedula, d.classification, d.socialStyle, d.attitudinalSegment,
            d.importantNotes, d.isInsuranceDoctor ? 1 : 0,
            JSON.stringify(d.visits || []), JSON.stringify(d.schedule || [])
        ]);

        res.json({ success: true, id: d.id });
    } catch (error) {
        console.error("Error saving doctor:", error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Eliminar Doctor
app.delete('/api/doctors/:id', async (req, res) => {
    try {
        await pool.execute("DELETE FROM doctors WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PROCEDURES ---

// GET: Todos los procedimientos
app.get('/api/procedures', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM procedures");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST: Upsert Procedimiento
app.post('/api/procedures', async (req, res) => {
    const p = req.body;
    try {
        const query = `
            INSERT INTO procedures (
                id, date, time, hospital, doctorId, doctorName, 
                procedureType, paymentType, cost, commission, technician, notes, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                date=VALUES(date), time=VALUES(time), hospital=VALUES(hospital),
                doctorId=VALUES(doctorId), doctorName=VALUES(doctorName),
                procedureType=VALUES(procedureType), paymentType=VALUES(paymentType),
                cost=VALUES(cost), commission=VALUES(commission),
                technician=VALUES(technician), notes=VALUES(notes), status=VALUES(status)
        `;

        await pool.execute(query, [
            p.id, p.date, p.time, p.hospital, p.doctorId, p.doctorName,
            p.procedureType, p.paymentType, p.cost || 0, p.commission || 0,
            p.technician, p.notes, p.status
        ]);

        res.json({ success: true, id: p.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Eliminar Procedimiento
app.delete('/api/procedures/:id', async (req, res) => {
    try {
        await pool.execute("DELETE FROM procedures WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor MySQL CRM en puerto ${PORT}`);
});
