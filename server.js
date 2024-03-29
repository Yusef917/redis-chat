const cluster = require('node:cluster');
const http = require('node:http');
const numCPUs = require('node:os').availableParallelism();
const process = require('node:process');
const { setupMaster, setupWorker } = require("@socket.io/sticky");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const { Server } = require("socket.io");
const { info } = require('node:console');
const express = require("express");
const Redis = require("ioredis");
const redisClient = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  });
  

/**
* Checking if the thread is a worker thread
* or primary thread.
*/



if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    /**
    * Creating http-server for the master.
    * All the child workers will share the same port (3000)
    */
    const httpServer = http.createServer();
    httpServer.listen(3000);
    // Setting up stick session
    setupMaster(httpServer, {
        loadBalancingMethod: "least-connection"
    });
    // Setting up communication between workers and primary
    setupPrimary();
    cluster.setupPrimary({
        serialization: "advanced"
    });
    // Launching workers based on the number of CPU threads.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    /**
    * Setting up the worker threads
    */
    console.log(`Worker ${process.pid} started`);
    /**
    * Creating Express App and Socket.io Server
    * and binding them to HTTP Server.
    */
    const app = express();
    const httpServer = http.createServer(app);
    const io = new Server(httpServer);

    app.use(express.static('public'))

    // Using the cluster socket.io adapter.
    io.adapter(createAdapter());
    // Setting up worker connection with the primary thread.
    setupWorker(io);
    io.on("connection", (socket) => {
        // Handling socket connections.
        socket.on("message", (data) => {
            console.log(`Message arrived at ${process.pid}`);
        });
    });
    // Handle HTTP Requests
    app.get("/", (req, res) => {
        res.send("Hello world");
    });


    io.on("connection", (socket) => {
        // Handling socket connections.
        socket.on("message", (data) => {
            console.log(`Message arrived at ${process.pid}:`, data);
            socket.emit("message", data);
        });
    });


    io.on("connection", (socket) => {
        // Handling socket connections.
        socket.on("message", (data) => {
            console.log(`Message arrived at ${process.pid}:`, data);
            io.emit("message", data);
        });
    });


    io.on("connection", async (socket) => {
        // Fetching all the messages from redis
        const existingMessages = await redisClient.lrange("chat_messages",
            0, -1);
        // Parsing the messages to JSON
        const parsedMessages = existingMessages.map((item) =>
            JSON.parse(item));
        // Sending all the messages to the user
        socket.emit("historical_messages", parsedMessages);


        // Handling socket connections.


        socket.on("message", (data) => {
            console.log(`Message arrived at ${process.pid}:`, data);
            redisClient.lpush("chat_messages", JSON.stringify(data));
            io.emit("message", data);
        });
    });
       

}