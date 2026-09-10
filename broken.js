// order-service.js

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

const orders = [];

function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeString(value) {
    return value.trim();
}

function validateAndNormalizeOrderInput(body) {
    if (!isPlainObject(body)) {
        return { error: "Invalid request body" };
    }

    let { customerId, items, total } = body;

    // customerId: required, string, reasonable length, safe charset
    if (typeof customerId !== "string") {
        return { error: "customerId must be a string" };
    }
    customerId = sanitizeString(customerId);
    if (customerId.length < 1 || customerId.length > 64) {
        return { error: "customerId must be between 1 and 64 characters" };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(customerId)) {
        return { error: "customerId contains invalid characters" };
    }

    // items: required, non-empty array, each item must be { productId: string, quantity: positive integer }
    if (!Array.isArray(items)) {
        return { error: "items must be an array" };
    }
    if (items.length < 1 || items.length > 100) {
        return { error: "items must contain between 1 and 100 entries" };
    }

    const normalizedItems = [];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!isPlainObject(it)) {
            return { error: `items[${i}] must be an object` };
        }

        let { productId, quantity } = it;

        if (typeof productId !== "string") {
            return { error: `items[${i}].productId must be a string` };
        }
        productId = sanitizeString(productId);
        if (productId.length < 1 || productId.length > 64) {
            return { error: `items[${i}].productId must be between 1 and 64 characters` };
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(productId)) {
            return { error: `items[${i}].productId contains invalid characters` };
        }

        // quantity must be a positive integer
        if (typeof quantity === "string" && quantity.trim() !== "") {
            quantity = Number(quantity);
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return { error: `items[${i}].quantity must be a positive integer` };
        }
        if (quantity > 1000000) {
            return { error: `items[${i}].quantity is too large` };
        }

        normalizedItems.push({ productId, quantity });
    }

    // total: required, numeric, finite, positive
    if (typeof total === "string" && total.trim() !== "") {
        total = Number(total);
    }
    if (typeof total !== "number" || !Number.isFinite(total)) {
        return { error: "total must be a finite number" };
    }
    if (total <= 0) {
        return { error: "total must be a positive number" };
    }
    // prevent extreme values / abuse
    if (total > 100000000) {
        return { error: "total is too large" };
    }

    // normalize to 2 decimal places to reduce downstream float issues
    total = Math.round(total * 100) / 100;

    return {
        value: {
            customerId,
            items: normalizedItems,
            total
        }
    };
}

// BUG 1: Missing input validation
app.post("/orders", async (req, res) => {
    const result = validateAndNormalizeOrderInput(req.body);
    if (result.error) {
        return res.status(400).json({
            error: result.error
        });
    }

    const { customerId, items, total } = result.value;

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
    res.json({
        environment: process.env,
        orders
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
