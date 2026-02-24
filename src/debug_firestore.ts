import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, limit } from "firebase/firestore";

const firebaseConfig = {
    // Configurações seriam necessárias aqui para rodar fora do browser, 
    // mas vou apenas deixar como referência de como debugar.
};

async function checkOrders() {
    const db = getFirestore();
    const ordersCol = collection(db, "orders");

    console.log("--- TESTE DE COLEÇÃO ---");
    const snap = await getDocs(ordersCol);
    console.log("Total na coleção:", snap.size);

    if (snap.size > 0) {
        const doc1 = snap.docs[0];
        console.log("Exemplo de doc:", doc1.id, doc1.data());
    }

    console.log("--- TESTE DE ORDERBY ---");
    try {
        const q = query(ordersCol, orderBy("createdAt", "desc"), limit(5));
        const snapQ = await getDocs(q);
        console.log("Total com orderBy:", snapQ.size);
    } catch (e: any) {
        console.error("Erro no orderBy:", e.message);
    }
}
