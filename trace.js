
// trace.js - DIRECT BLOCKCHAIN CONNECTION (NO WALLET REQUIRED)

// 1. CONFIGURATION
const CONTRACT_ADDRESS = "0xAf3A0D87189d979f2052266218A518F1c616f511";

// 2. MINIMAL CONTRACT ABI
const BATCH_ABI = [
    "function getBatch(uint256 _id) view returns (tuple(uint256 id, string name, string productionDate, string factory, string ipfsHash, uint8 status))",
    "function batchCount() view returns (uint256)"
];

// 3. BATCH STATUS CONVERSION
function getStatusText(statusCode) {
    const status = [
        "📦 Created",
        "🧪 Checked",
        "✅ Approved",
        "🚚 Distributed"
    ];
    return status[statusCode] || "Unknown";
}

// 4. MAIN FUNCTION
async function loadBatchInfo() {
    const infoDiv = document.getElementById('batch-info');
    infoDiv.innerHTML = "<p>⏳ Loading data from the blockchain...</p>";

    try {
        // Use a public Ethereum Sepolia RPC endpoint.
        const provider = new ethers.JsonRpcProvider(
            "https://ethereum-sepolia-rpc.publicnode.com"
        );

        console.log("Connected to provider:", provider);

        const contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            BATCH_ABI,
            provider
        );

        // STEP 1: RETRIEVE BATCH ID FROM THE URL
        const urlParams = new URLSearchParams(window.location.search);
        let batchId = urlParams.get('id');

        // If no batch ID is provided, retrieve the latest batch.
        if (!batchId) {
            console.log("No batch ID provided. Retrieving the latest batch...");
            const count = await contract.batchCount();
            batchId = count.toString();
        }

        console.log(`Loading batch #${batchId}...`);

        // STEP 2: RETRIEVE BATCH DATA FROM THE SMART CONTRACT
        const batch = await contract.getBatch(batchId);

        // STEP 3: DISPLAY BATCH INFORMATION
        const displayHtml = `
            <div style="font-family: Arial, sans-serif; text-align: left; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: inline-block; max-width: 400px;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                    🥛 Milk Batch #${batch.id}
                </h2>

                <p><strong>🔹 Product Name:</strong>
                    <span style="color:#2980b9; font-weight:bold">${batch.name}</span>
                </p>

                <p><strong>📅 Production Date:</strong> ${batch.productionDate}</p>

                <p><strong>🏭 Manufacturing Plant:</strong> ${batch.factory}</p>

                <p><strong>📊 Batch Status:</strong>
                    <span style="color:green; font-weight:bold">${getStatusText(batch.status)}</span>
                </p>

                <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;">

                <div style="text-align: center;">
                    <p style="margin-bottom: 10px; font-weight: bold;">Scan the QR Code:</p>
                    <div id="qrcode-container" style="display:flex; justify-content:center;"></div>
                </div>
            </div>
        `;

        infoDiv.innerHTML = displayHtml;

        // STEP 4: GENERATE A DYNAMIC QR CODE
        const currentUrl = window.location.href.split('?')[0] + '?id=' + batch.id;

        if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById("qrcode-container"), {
                text: currentUrl,
                width: 150,
                height: 150
            });
        }

    } catch (error) {
        console.error("Error details:", error);

        infoDiv.innerHTML = `
            <div style="color: red; background: #ffe6e6; padding: 20px; border-radius: 8px;">
                <h3>❌ Failed to Load Batch Data!</h3>
                <p>${error.message}</p>
                <p><small>Please refresh the page and try again.</small></p>
            </div>
        `;
    }
}

window.onload = loadBatchInfo;
