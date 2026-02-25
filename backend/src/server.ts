import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
    console.warn("Warning: GEMINI_API_KEY is not set.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const app = express();
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", 
    }
});

const users = new Map();

const PROXIMITY_THRESHOLD = 100; 

function checkProximity(activeSocketId: string, x1: number, y1: number) {
    users.forEach((otherUser, otherSocketId) => {
        if (activeSocketId === otherSocketId) return; 

        const distance = Math.sqrt(
            Math.pow(otherUser.x - x1, 2) + Math.pow(otherUser.y - y1, 2)
        );

        if (distance < PROXIMITY_THRESHOLD) {
            io.to(activeSocketId).emit("proximity-update", { 
                nearTo: otherUser.name, 
                status: "active" 
            });
            io.to(otherSocketId).emit("proximity-update", { 
                nearTo: users.get(activeSocketId).name, 
                status: "active" 
            });
        }
    });
}

io.on("connection", (socket) => {
    console.log(`Utilizador conectado: ${socket.id}`);

    socket.on("join-world", (userData) => {
        const newUser = {
            id: socket.id,
            x: userData.x || 100,
            y: userData.y || 100,
            name: userData.name || "Investigador",
            avatar: userData.avatar || "default"
        };
        users.set(socket.id, newUser);
        
        io.emit("update-users", Array.from(users.values()));
    });

    socket.on("move", (pos) => {
        const user = users.get(socket.id);
        if (user) {
            user.x = pos.x;
            user.y = pos.y;
            
            socket.broadcast.emit("user-moved", user);
            checkProximity(socket.id, user.x, user.y);
        }
    });

    socket.on("disconnect", () => {
        users.delete(socket.id);
        io.emit("update-users", Array.from(users.values()));
        console.log(`Utilizador saiu: ${socket.id}`);
    });
});

app.post("/agent", async (req, res) => {
    try {
        const { message } = req.body as { message?: string };
        if (!message) return res.status(400).json({ error: "message is required" });

        const result = await model.generateContent(message);
        const text = result.response.text();

        return res.json({ ok: true, reply: text });
    } catch (err) {
        console.error("Agent error:", err);
        return res.status(500).json({ error: "internal_error" });
    }
});

const port = process.env.PORT || 8081;

httpServer.listen(port, () => {
    console.log(`Zaeon engine (Real-time + Agent) listening on port ${port}`);
});