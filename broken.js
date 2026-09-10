// order-service.js

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

const orders = [];

// BUG 1: Missing input validation
app.post("/orders", async (req, res) => {
    const { customerId, items, total } = req.body;

    const order = {
        id: crypto.randomUUID(),
        customerId,
        items,
        total,
        status: "pending",
        createdAt: new Date()
    };

    orders.push(order);

    res.status(201).json(order);
});

// BUG 2: Incorrect variable name
app.get("/orders/:id", (req, res) => {
    const order = orders.find(
        item => item.id === req.params.orderId
    );

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    res.json(order);
});

// BUG 3: Allows negative quantities
app.put("/orders/:id/items", (req, res) => {
    const { productId, quantity } = req.body;

    const order = orders.find(
        item => item.id === req.params.id
    );

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    order.items.push({
        productId,
        quantity
    });

    res.json(order);
});

// BUG 4: Race-condition-style asynchronous update
app.post("/orders/:id/pay", async (req, res) => {
    const order = orders.find(
        item => item.id === req.params.id
    );

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    if (order.status === "paid") {
        return res.status(400).json({
            error: "Order already paid"
        });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    order.status = "paid";
    order.paymentId = req.body.paymentId;

    res.json(order);
});

// BUG 5: Sensitive information returned
app.get("/debug/orders", (req, res) => {
    return res.status(404).json({
        error: "Not found"
    });
});

// BUG 6: Incorrect status code
app.delete("/orders/:id", (req, res) => {
    const index = orders.findIndex(
        order => order.id === req.params.id
    );

    if (index === -1) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    orders.splice(index, 1);

    res.status(200).send();
});

// BUG 7: Undefined function
app.get("/orders/:id/total", (req, res) => {
    const order = orders.find(
        order => order.id === req.params.id
    );

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    const total = calculateOrderTotal(order.items);

    res.json({ total });
});

// BUG 8: Trusts client-provided total
app.post("/orders/:id/refund", (req, res) => {
    const order = orders.find(
        order => order.id === req.params.id
    );

    if (!order) {
        return res.status(404).json({
            error: "Order not found"
        });
    }

    const refundAmount = req.body.amount;

    if (refundAmount > order.total) {
        return res.status(400).json({
            error: "Invalid refund amount"
        });
    }

    order.status = "refunded";
    order.refundedAmount = refundAmount;

    res.json(order);
});

// BUG 9: Hardcoded API key
const PAYMENT_API_KEY = "sk_live_123456789_secret";

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        paymentConfigured: Boolean(PAYMENT_API_KEY)
    });
});

// BUG 10: Server starts even if startup initialization fails
async function startServer() {
    await initializePaymentService();

    app.listen(PORT, () => {
        console.log(`Order service running on ${PORT}`);
    });
}

// BUG 11: Undefined function
startServer();
