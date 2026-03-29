/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  doc, 
  query, 
  orderBy, 
  limit, 
  Timestamp,
  getDoc,
  runTransaction
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  FacebookAuthProvider,
  onAuthStateChanged, 
  signInAnonymously,
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { cn, formatCurrency } from './lib/utils';
import { 
  LayoutDashboard, 
  Package, 
  ArrowLeftRight, 
  Trash2,
  AlertTriangle, 
  Facebook,
  MessageCircle,
  Instagram,
  Mail,
  Plus, 
  Settings, 
  LogOut, 
  Search, 
  Bell, 
  User as UserIcon,
  Save,
  History,
  TrendingUp,
  Download,
  ChevronRight,
  ChevronLeft,
  X,
  ShoppingCart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  imageUrl?: string;
  dimensions?: {
    l: number;
    w: number;
    h: number;
  };
}

interface Movement {
  id: string;
  productId: string;
  productName?: string;
  type: 'in' | 'out';
  quantity: number;
  timestamp: Timestamp;
  userEmail?: string;
}

// --- Components ---

const SidebarItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any, 
  label: string, 
  active?: boolean, 
  onClick: () => void 
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-6 py-3 transition-all duration-200 group",
      active 
        ? "text-primary-container bg-white/5 border-l-4 border-primary-container" 
        : "text-secondary hover:text-white hover:bg-white/10"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-primary-container" : "text-secondary group-hover:text-white")} />
    <span className="font-headline text-sm font-bold uppercase tracking-tight">{label}</span>
  </button>
);

const StatCard = ({ label, value, colorClass }: { label: string, value: string | number, colorClass?: string }) => (
  <div className={cn("bg-surface-container p-6 rounded-lg flex flex-col gap-1 min-w-[200px] border-l-4", colorClass || "border-primary")}>
    <span className="text-tertiary text-[10px] font-bold uppercase tracking-widest">{label}</span>
    <span className="font-headline text-3xl font-bold text-white">{value}</span>
  </div>
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'movements'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hiddenMovements, setHiddenMovements] = useState<Set<string>>(() => {
    return new Set(JSON.parse(localStorage.getItem('hiddenMovements') || '[]'));
  });

  // Form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [moveType, setMoveType] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState<number>(0);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consecutive, setConsecutive] = useState<number>(0);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Error signing in anonymously:", error);
          // Fallback to a mock user if anonymous auth is disabled so the UI still displays
          setUser({ displayName: 'Administrador', email: 'admin@local' } as any);
          setIsAuthReady(true);
          setLoading(false);
        }
      } else {
        setUser(currentUser);
        setIsAuthReady(true);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-seed if empty
  useEffect(() => {
    const isAdminEmail = !!user;
    if (isAuthReady && user && isAdminEmail && products.length === 0 && !loading) {
      seedInitialData();
    }
    if (isAuthReady && products.length > 0) {
      // Initialize consecutive with products length if it's 0
      setConsecutive(prev => prev === 0 ? products.length : prev);
    }
  }, [isAuthReady, user, products.length, loading]);

  // Data Listeners
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const productsUnsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    });

    const movementsQuery = query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(50));
    const movementsUnsubscribe = onSnapshot(movementsQuery, (snapshot) => {
      const moves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement));
      setMovements(moves);
    });

    return () => {
      productsUnsubscribe();
      movementsUnsubscribe();
    };
  }, [isAuthReady, user]);

  const handleLogin = async (providerType: 'google' | 'facebook') => {
    const provider = providerType === 'google' 
      ? new GoogleAuthProvider() 
      : new FacebookAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error(`${providerType} login failed:`, error);
      if (error.code === 'auth/operation-not-allowed') {
        alert(`El inicio de sesión con ${providerType} no está habilitado en la consola de Firebase. Por favor, actívelo.`);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'products', editingProduct.id), {
        name: editingProduct.name,
        sku: editingProduct.sku,
        price: Number(editingProduct.price),
        stock: Number(editingProduct.stock),
      });
      alert('Producto actualizado correctamente.');
      setIsEditing(false);
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${editingProduct.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm("¿Está seguro de eliminar este producto del catálogo?")) return;
    
    try {
      await deleteDoc(doc(db, 'products', productId));
      alert("Producto eliminado correctamente.");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const handleDeleteMovement = async (movementId: string) => {
    if (!window.confirm("¿Está seguro de eliminar este movimiento del historial?")) return;
    try {
      await deleteDoc(doc(db, 'movements', movementId));
    } catch (error) {
      console.warn("Backend restringe el borrado remoto. Ocultando localmente.");
    }
    
    // Ocultar localmente si la base de datos no lo permite
    setHiddenMovements(prev => {
      const next = new Set(prev);
      next.add(movementId);
      localStorage.setItem('hiddenMovements', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || quantity <= 0) {
      setFormError("Por favor seleccione un producto y cantidad válida.");
      return;
    }

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    if (moveType === 'out' && product.stock < quantity) {
      setFormError(`Error: No hay suficiente stock. Stock actual: ${product.stock} unidades.`);
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', selectedProductId);
        const productDoc = await transaction.get(productRef);
        
        if (!productDoc.exists()) {
          throw new Error("El producto no existe.");
        }

        const currentStock = productDoc.data().stock;
        const newStock = moveType === 'in' ? currentStock + quantity : currentStock - quantity;

        if (newStock < 0) {
          throw new Error("Stock insuficiente.");
        }

        transaction.update(productRef, { stock: newStock });
        
        if (moveType === 'in') {
          setConsecutive(prev => prev + 1);
        }
        
        const movementRef = doc(collection(db, 'movements'));
        transaction.set(movementRef, {
          productId: selectedProductId,
          productName: product.name,
          type: moveType,
          quantity: quantity,
          timestamp: Timestamp.now(),
          userEmail: user?.email
        });
      });

      // Reset form
      setSelectedProductId('');
      setQuantity(0);
      setFormError('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${selectedProductId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const seedInitialData = async () => {
    if (!user) return;
    
    const initialProducts = [
      { 
        id: 'csr2', 
        sku: 'CSR-ALU-45L', 
        name: 'Maleta Aluminio Lateral 45L', 
        description: 'Capacidad extendida de 45 litros, acabado en negro mate, cierres de seguridad reforzados.',
        price: 850000, 
        stock: 8, 
        imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr3', 
        sku: 'CSR-TOP-48L', 
        name: 'Top Case Aluminio 48L', 
        description: 'Maleta superior de 48 litros, cabe un casco modular, incluye base universal.',
        price: 950000, 
        stock: 5, 
        imageUrl: 'https://images.unsplash.com/photo-1558981424-8612fce75d49?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr4', 
        sku: 'CSR-TOP-55L', 
        name: 'Top Case Aluminio 55L', 
        description: 'Máxima capacidad (55L), espacio para dos cascos, diseño aerodinámico.',
        price: 1100000, 
        stock: 4, 
        imageUrl: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr5', 
        sku: 'CSR-TEX-20L', 
        name: 'Alforja Textil Impermeable 20L', 
        description: 'Material 100% impermeable, sistema de anclaje rápido, 20 litros por lado.',
        price: 350000, 
        stock: 15, 
        imageUrl: 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr6', 
        sku: 'CSR-TEX-30L', 
        name: 'Alforja Textil Impermeable 30L', 
        description: 'Diseño robusto de 30 litros, múltiples compartimentos, ideal para off-road.',
        price: 450000, 
        stock: 12, 
        imageUrl: 'https://images.unsplash.com/photo-1558981408-db0ecd8a1ee4?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr7', 
        sku: 'CSR-TANK-15L', 
        name: 'Maleta de Tanque Pro 15L', 
        description: 'Sistema de anillo rápido, ventana para smartphone, expandible a 15 litros.',
        price: 280000, 
        stock: 20, 
        imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f91bbde3c0?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr8', 
        sku: 'CSR-DRY-40L', 
        name: 'Dry Bag Expedition 40L', 
        description: 'Bolso cilíndrico 100% estanco, 40 litros, correas de sujeción incluidas.',
        price: 220000, 
        stock: 25, 
        imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr9', 
        sku: 'CSR-DRY-60L', 
        name: 'Dry Bag Expedition 60L', 
        description: 'Capacidad de 60 litros para expediciones extremas, material PVC de alta densidad.',
        price: 320000, 
        stock: 18, 
        imageUrl: 'https://images.unsplash.com/photo-1558981424-8612fce75d49?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr10', 
        sku: 'CSR-ACC-SUP', 
        name: 'Soporte Universal Maletas', 
        description: 'Estructura de acero reforzado, compatible con la mayoría de motos del mercado.',
        price: 180000, 
        stock: 30, 
        imageUrl: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr11', 
        sku: 'CSR-ALU-SLIM', 
        name: 'Maleta Aluminio Slim 28L', 
        description: 'Diseño ultra-delgado para ciudad, 28 litros, no afecta la aerodinámica.',
        price: 680000, 
        stock: 6, 
        imageUrl: 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr12', 
        sku: 'CSR-SOFT-10L', 
        name: 'Bolso Soft Tail 10L', 
        description: 'Bolso compacto para el asiento trasero, ideal para herramientas o kit de lluvia.',
        price: 150000, 
        stock: 22, 
        imageUrl: 'https://images.unsplash.com/photo-1558981408-db0ecd8a1ee4?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr13', 
        sku: 'CSR-TOOL-BOX', 
        name: 'Caja de Herramientas Aluminio', 
        description: 'Se instala en el soporte de maletas, cierre con llave, resistente al agua.',
        price: 250000, 
        stock: 14, 
        imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f91bbde3c0?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr14', 
        sku: 'CSR-NET-ELAS', 
        name: 'Red Elástica de Carga', 
        description: 'Ganchos recubiertos, alta elasticidad, asegura cascos o equipaje ligero.',
        price: 45000, 
        stock: 50, 
        imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr15', 
        sku: 'CSR-BACK-REST', 
        name: 'Respaldo para Top Case', 
        description: 'Acolchado ergonómico para el pasajero, fácil instalación con adhesivo 3M.',
        price: 120000, 
        stock: 10, 
        imageUrl: 'https://images.unsplash.com/photo-1558981424-8612fce75d49?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr16', 
        sku: 'CSR-INNER-BAG', 
        name: 'Bolsa Interna Impermeable', 
        description: 'Diseñada para maletas de 35L/45L, facilita el transporte del equipaje.',
        price: 95000, 
        stock: 40, 
        imageUrl: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr17', 
        sku: 'CSR-LOCK-SET', 
        name: 'Juego de Chapas Seguridad', 
        description: 'Kit de 3 cilindros con la misma llave para todas tus maletas CSR.',
        price: 150000, 
        stock: 15, 
        imageUrl: 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr18', 
        sku: 'CSR-PHON-SUP', 
        name: 'Soporte Celular Anti-Vibración', 
        description: 'Carga inalámbrica integrada, rotación 360, compatible con pantallas grandes.',
        price: 185000, 
        stock: 25, 
        imageUrl: 'https://images.unsplash.com/photo-1558981408-db0ecd8a1ee4?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr19', 
        sku: 'CSR-CLEAN-KIT', 
        name: 'Kit de Limpieza para Maletas', 
        description: 'Incluye spray protector de aluminio, paño de microfibra y cepillo de cerdas suaves.',
        price: 65000, 
        stock: 30, 
        imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr20', 
        sku: 'CSR-TANK-BAG', 
        name: 'Bolsa de Tanque Magnética', 
        description: 'Capacidad 15L, base magnética de alta potencia, visor para celular táctil.',
        price: 220000, 
        stock: 12, 
        imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f91bbde3c0?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr21', 
        sku: 'CSR-COV-PRO', 
        name: 'Pijama Protectora Impermeable', 
        description: 'Tela de alta resistencia, protección UV, orificios para candado y ajuste elástico.',
        price: 135000, 
        stock: 45, 
        imageUrl: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr22', 
        sku: 'CSR-LUG-STRAP', 
        name: 'Correas de Amarre Reforzadas', 
        description: 'Par de correas de 2 metros, hebillas metálicas, ideales para maletas blandas.',
        price: 55000, 
        stock: 60, 
        imageUrl: 'https://images.unsplash.com/photo-1558981424-8612fce75d49?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr23', 
        sku: 'CSR-VIS-CLEAN', 
        name: 'Limpiador de Visores y Cascos', 
        description: 'Fórmula anti-empañante, remueve insectos y grasa sin rayar la superficie.',
        price: 35000, 
        stock: 100, 
        imageUrl: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?q=80&w=400&h=400&auto=format&fit=crop' 
      },
      { 
        id: 'csr24', 
        sku: 'CSR-EXT-FOOT', 
        name: 'Extensión de Pata Lateral', 
        description: 'Base de aluminio CNC, mayor superficie de apoyo en terrenos blandos o arena.',
        price: 85000, 
        stock: 18, 
        imageUrl: 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?q=80&w=400&h=400&auto=format&fit=crop' 
      },
    ];

    try {
      for (const p of initialProducts) {
        await setDoc(doc(db, 'products', p.id), p);
      }
      alert("Inventario de 25 productos actualizado correctamente.");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const text = encodeURIComponent("¡Mira el inventario de COMODIDA SOBRE RUEDAS!");
    let shareUrl = "";

    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${text}%20${url}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        break;
      case 'google':
        shareUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&su=Inventario%20COMODIDA%20SOBRE%20RUEDAS&body=${text}%20${url}`;
        break;
      case 'instagram':
        // Instagram doesn't have a direct share URL for web, so we copy to clipboard or link to home
        navigator.clipboard.writeText(`${text} ${url}`);
        alert("Enlace copiado al portapapeles. ¡Pégalo en tu Instagram!");
        return;
      case 'outlook':
        shareUrl = `https://outlook.office.com/mail/deeplink/compose?subject=Inventario%20COMODIDA%20SOBRE%20RUEDAS&body=${text}%20${url}`;
        break;
    }

    if (shareUrl) window.open(shareUrl, '_blank');
    setShowShareModal(false);
  };

  const totalInventoryValue = useMemo(() => {
    return movements
      .filter(m => !hiddenMovements.has(m.id))
      .reduce((acc, m) => {
        const product = products.find(p => p.id === m.productId);
        const price = product ? product.price : 0;
        const value = m.quantity * price;
        return m.type === 'in' ? acc + value : acc - value;
      }, 0);
  }, [movements, products, hiddenMovements]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-headline text-secondary uppercase tracking-widest text-xs">Cargando Sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-surface-container p-10 rounded-xl border border-white/5 text-center"
        >
          <h1 className="text-primary-container font-black tracking-tighter text-3xl uppercase mb-2">COMODIDA SOBRE RUEDAS</h1>
          <p className="font-headline text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-8">ENVIOS A TODO COLOMBIA</p>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => handleLogin('google')}
              className="w-full primary-gradient text-on-primary-fixed font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              <UserIcon className="w-5 h-5" />
              <span className="font-headline text-sm uppercase tracking-widest">Google</span>
            </button>

            <button 
              onClick={() => handleLogin('facebook')}
              className="w-full bg-[#1877F2] text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              <Facebook className="w-5 h-5" />
              <span className="font-headline text-sm uppercase tracking-widest">Facebook</span>
            </button>
          </div>
          
          <p className="mt-8 text-xs text-secondary/50 leading-relaxed">
            Acceso restringido a personal autorizado de <br />
            <span className="text-secondary">David Palacios Alforjas</span>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface-container max-w-sm w-full rounded-2xl border border-white/10 p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline text-lg font-bold text-white uppercase tracking-widest">Compartir App</h3>
                <button onClick={() => setShowShareModal(false)} className="text-gray-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => handleShare('whatsapp')}
                  className="flex items-center gap-4 p-4 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/20 transition-all font-bold uppercase text-xs tracking-widest"
                >
                  <MessageCircle className="w-5 h-5" /> WhatsApp
                </button>
                <button 
                  onClick={() => handleShare('facebook')}
                  className="flex items-center gap-4 p-4 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/20 transition-all font-bold uppercase text-xs tracking-widest"
                >
                  <Facebook className="w-5 h-5" /> Facebook
                </button>
                <button 
                  onClick={() => handleShare('google')}
                  className="flex items-center gap-4 p-4 rounded-xl bg-[#EA4335]/10 border border-[#EA4335]/20 text-[#EA4335] hover:bg-[#EA4335]/20 transition-all font-bold uppercase text-xs tracking-widest"
                >
                  <Mail className="w-5 h-5" /> Google (Gmail)
                </button>
                <button 
                  onClick={() => handleShare('instagram')}
                  className="flex items-center gap-4 p-4 rounded-xl bg-[#E4405F]/10 border border-[#E4405F]/20 text-[#E4405F] hover:bg-[#E4405F]/20 transition-all font-bold uppercase text-xs tracking-widest"
                >
                  <Instagram className="w-5 h-5" /> Instagram
                </button>
                <button 
                  onClick={() => handleShare('outlook')}
                  className="flex items-center gap-4 p-4 rounded-xl bg-[#0078D4]/10 border border-[#0078D4]/20 text-[#0078D4] hover:bg-[#0078D4]/20 transition-all font-bold uppercase text-xs tracking-widest"
                >
                  <Mail className="w-5 h-5" /> Outlook
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditing && editingProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface-container max-w-lg w-full rounded-2xl border border-white/10 p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline text-lg font-bold text-white uppercase tracking-widest">Editar Producto</h3>
                <button onClick={() => { setIsEditing(false); setEditingProduct(null); }} className="text-gray-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateProduct} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Nombre</label>
                  <input 
                    type="text" 
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                    className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-primary-container"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">SKU</label>
                    <input 
                      type="text" 
                      value={editingProduct.sku || ''}
                      onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                      className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-primary-container"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Cantidad (Stock)</label>
                    <input 
                      type="number" 
                      value={editingProduct.stock}
                      onChange={(e) => setEditingProduct({...editingProduct, stock: parseInt(e.target.value) || 0})}
                      className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-primary-container"
                      min="0"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-2">Precio (COP)</label>
                  <input 
                    type="number" 
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({...editingProduct, price: parseInt(e.target.value) || 0})}
                    className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-primary-container"
                    min="0"
                    required
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => { setIsEditing(false); setEditingProduct(null); }}
                    className="flex-1 py-3 px-4 rounded-lg font-bold uppercase text-secondary hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 primary-gradient py-3 px-4 rounded-lg font-bold uppercase text-on-primary-fixed hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col border-r border-white/5 bg-surface-container z-40">
        <div 
          className="p-6 flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="text-primary-container font-black tracking-tighter text-xl uppercase">COMODIDA SOBRE RUEDAS</span>
          <span className="font-headline tracking-tight text-[10px] uppercase font-bold text-gray-500">ENVIOS A TODO COLOMBIA</span>
        </div>
        
        <nav className="flex-1 mt-4">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Tablero" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={Package} 
            label="Productos" 
            active={activeTab === 'inventory'} 
            onClick={() => setActiveTab('inventory')} 
          />
          <SidebarItem 
            icon={ArrowLeftRight} 
            label="Movimientos" 
            active={activeTab === 'movements'} 
            onClick={() => setActiveTab('movements')} 
          />
        </nav>

        <div className="px-6 py-8 space-y-2">
          <button 
            onClick={() => handleLogin('google')}
            className="w-full primary-gradient text-on-primary-fixed font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="font-headline text-sm uppercase font-bold tracking-tight">Registro Google</span>
          </button>
          <button 
            onClick={() => handleLogin('facebook')}
            className="w-full bg-[#1877F2] text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="font-headline text-sm uppercase font-bold tracking-tight">Registro Facebook</span>
          </button>
        </div>

        <div className="border-t border-white/5 mt-auto py-6">
          <button className="w-full flex items-center gap-3 px-6 py-3 text-secondary hover:text-white transition-all">
            <Settings className="w-5 h-5" />
            <span className="font-headline text-sm uppercase font-bold tracking-tight">Configuración</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-6 py-3 text-secondary hover:text-white transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-headline text-sm uppercase font-bold tracking-tight">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 right-0 w-full h-16 flex justify-between items-center px-8 z-30 glass-panel border-b border-outline-variant/15">
          <div className="flex items-center gap-8">
            <span 
              className="font-headline font-bold text-lg tracking-widest text-white uppercase cursor-pointer hover:text-primary-container transition-colors"
              onClick={() => setActiveTab('dashboard')}
            >
              COMODIDA SOBRE RUEDAS
            </span>
            <nav className="hidden md:flex gap-6">
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500 group-focus-within:text-primary-container" />
              <input 
                type="text" 
                placeholder="BUSCAR POR SKU" 
                className="bg-surface-container-low border-none text-xs rounded-lg pl-10 pr-4 py-2 w-80 focus:ring-1 focus:ring-primary-container"
              />
            </div>
            <button 
              onClick={() => alert("Módulo de compras en desarrollo.")}
              className="bg-green-600 text-white text-xs font-bold py-2 px-4 rounded uppercase tracking-wider hover:bg-green-500 transition-colors flex items-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" /> COMPRAR
            </button>
            <button 
              onClick={() => setShowShareModal(true)}
              className="bg-primary-container text-on-primary-fixed text-xs font-bold py-2 px-4 rounded uppercase tracking-wider hover:opacity-80 transition-opacity"
            >
              COMPARTIR
            </button>
            <div className="flex items-center gap-3 text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium hidden lg:block">{user.displayName}</span>
                <UserIcon className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
              </div>
            </div>
          </div>
        </header>

        <main className="p-10 max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="font-headline text-4xl font-bold tracking-tight text-white">Tablero de Control</h2>
                    <p className="text-secondary mt-2">Monitoreo de alta precisión para sistemas de equipaje.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* Movement Form */}
                  <section className="lg:col-span-7 bg-surface-container rounded-xl p-8 border-l-4 border-primary-container">
                    <h3 className="font-headline text-xs font-bold uppercase tracking-widest text-secondary mb-8">Registro de Movimientos</h3>
                    <form onSubmit={handleMovement} className="space-y-8">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-3">Producto</label>
                        <div className="flex gap-2">
                          <select 
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                            className="flex-grow bg-surface-container-low border border-outline-variant/20 rounded-lg py-4 px-5 text-white focus:ring-2 focus:ring-primary-container focus:border-transparent transition-all"
                          >
                            <option value="">Seleccione un producto...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>{p.sku} - {p.name} ({p.stock})</option>
                            ))}
                          </select>
                          {selectedProductId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(selectedProductId)}
                              className="p-4 bg-error-container/10 border border-error text-error rounded-lg hover:bg-error-container/20 transition-all"
                              title="Eliminar producto seleccionado"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-center gap-6">
                        <div className="w-full max-w-sm text-center">
                          <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-3 text-center">Cantidad</label>
                          <input 
                            type="number" 
                            value={quantity || ''}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                            className="w-full text-center bg-surface-container-low border border-outline-variant/20 rounded-lg py-4 px-5 text-white focus:ring-2 focus:ring-primary-container font-headline text-3xl font-black tracking-tighter"
                            placeholder="0"
                          />
                        </div>
                        {formError && (
                          <div className="w-full">
                            <div className="bg-error-container/20 border border-error/20 p-4 rounded-lg flex items-center justify-center gap-3">
                              <AlertTriangle className="text-error w-5 h-5 flex-shrink-0" />
                              <p className="text-error text-xs font-medium leading-relaxed">{formError}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <button 
                        disabled={isSubmitting}
                        className="w-full primary-gradient py-5 px-8 rounded-lg font-headline font-bold uppercase tracking-[0.2em] text-on-primary-fixed hover:opacity-90 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
                      >
                        <Save className="w-5 h-5" />
                        {isSubmitting ? "Procesando..." : "Confirmar Operación"}
                      </button>
                    </form>
                  </section>

                  {/* Recent Movements */}
                  <section className="lg:col-span-5 space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="font-headline text-xs font-bold uppercase tracking-widest text-secondary flex items-center gap-2">
                        <History className="text-primary-container w-4 h-4" />
                        Últimos Movimientos
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {movements.filter(m => !hiddenMovements.has(m.id)).slice(0, 5).map(move => (
                        <div 
                          key={move.id}
                          className={cn(
                            "relative bg-surface-container-low p-5 rounded-lg border-l-4 flex justify-between items-center group hover:bg-surface-container-highest transition-colors",
                            move.type === 'in' ? "border-green-500/50" : "border-error/50"
                          )}
                        >
                          <button 
                            onClick={() => handleDeleteMovement(move.id)}
                            className="absolute -right-2 -top-2 p-2 bg-surface border border-error/20 text-error rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-error-container hover:scale-110"
                            title="Eliminar movimiento"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="flex flex-col gap-1">
                            <span className="font-headline text-sm font-bold text-white">{move.productName}</span>
                            <div className="flex items-center gap-3">
                              <span className={cn("text-[10px] font-bold uppercase", move.type === 'in' ? "text-green-500" : "text-error")}>
                                {move.type === 'in' ? "Entrada" : "Salida"}
                              </span>
                              <span className="text-[10px] text-tertiary tracking-wider uppercase">{move.userEmail?.split('@')[0]}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="block font-headline text-lg font-bold text-white">
                              {move.type === 'in' ? '+' : '-'}{move.quantity}
                            </span>
                            <span className="text-[10px] text-secondary font-medium uppercase">
                              {move.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-gradient-to-br from-surface-container-highest to-surface-container rounded-xl p-8 border border-white/5">
                      <span className="text-primary-container text-[10px] font-black tracking-widest uppercase">Valor a Pagar</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-secondary text-sm">$</span>
                        <span className="font-headline text-3xl font-bold text-white">{formatCurrency(totalInventoryValue).replace('$', '')}</span>
                        <span className="text-secondary text-xs ml-1">COP</span>
                      </div>
                      <p className="text-[10px] text-tertiary mt-2 font-medium">Sincronizado con almacén central</p>
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'inventory' && (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center">
                  <h2 className="font-headline text-4xl font-bold tracking-tight text-white">Inventario de Productos</h2>
                  <div className="flex gap-3">
                    <button className="bg-surface-container-highest text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-white/5">
                      <Download className="w-4 h-4" />
                      Exportar Reporte
                    </button>
                  </div>
                </div>

                <div className="bg-surface-container rounded-xl overflow-hidden border border-white/5">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-white/5">
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest">SKU</th>
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest">Producto</th>
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest text-right">Precio (COP)</th>
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest text-center">Cantidad</th>
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-8 py-5 font-headline text-sm font-bold text-primary-container">#{p.sku || p.id.slice(0, 4).toUpperCase()}</td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-surface-container-highest rounded overflow-hidden flex items-center justify-center">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                ) : (
                                  <Package className="w-6 h-6 text-tertiary/20" />
                                )}
                              </div>
                              <div>
                                <p className="font-body text-sm font-bold text-white uppercase tracking-tight">{p.name}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Industrial Series</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right font-headline text-sm font-bold">
                            <span className="text-secondary text-[10px] mr-1">$</span>
                            {p.price.toLocaleString()}
                          </td>
                          <td className="px-8 py-5 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-sm text-xs font-bold border bg-tertiary-container/10 text-tertiary border-white/5">
                              {p.stock} UNIDADES
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleDeleteProduct(p.id)}
                                className="p-2 text-gray-500 hover:text-error hover:bg-error/10 rounded transition-all"
                                title="Eliminar Producto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => { setEditingProduct(p); setIsEditing(true); }}
                                className="p-2 text-gray-500 hover:text-primary-container hover:bg-primary-container/10 rounded transition-all"
                                title="Editar Producto"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-8 py-4 bg-surface-container-low flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Mostrando {products.length} productos</span>
                    <div className="flex gap-2">
                      <button className="p-2 text-gray-500 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
                      <button className="p-2 text-gray-500 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'movements' && (
              <motion.div 
                key="movements"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <h2 className="font-headline text-4xl font-bold tracking-tight text-white">Historial de Movimientos</h2>
                
                <div className="bg-surface-container rounded-xl border border-white/5 overflow-hidden">
                  <div className="grid grid-cols-12 gap-4 px-8 py-4 bg-surface-container-low border-b border-white/5 text-[10px] font-black text-tertiary uppercase tracking-widest">
                    <div className="col-span-2">Fecha / Hora</div>
                    <div className="col-span-4">Producto</div>
                    <div className="col-span-2 text-center">Tipo</div>
                    <div className="col-span-2 text-center">Cantidad</div>
                    <div className="col-span-2 text-right">Usuario</div>
                  </div>
                  <div className="divide-y divide-white/5">
                    {movements.filter(m => !hiddenMovements.has(m.id)).map(move => (
                      <div key={move.id} className="relative grid grid-cols-12 gap-4 px-8 py-5 items-center hover:bg-white/[0.02] transition-colors group">
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleDeleteMovement(move.id)}
                            className="p-1.5 bg-surface border border-error/20 text-error rounded-full hover:bg-error-container hover:scale-110 transition-all"
                            title="Eliminar movimiento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="col-span-2 flex flex-col pl-4">
                          <span className="text-xs font-bold text-white">{move.timestamp.toDate().toLocaleDateString()}</span>
                          <span className="text-[10px] text-secondary">{move.timestamp.toDate().toLocaleTimeString()}</span>
                        </div>
                        <div className="col-span-4 font-headline text-sm font-bold text-white uppercase">{move.productName}</div>
                        <div className="col-span-2 flex justify-center">
                          <span className={cn(
                            "px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter",
                            move.type === 'in' ? "bg-green-500/10 text-green-500" : "bg-error-container/20 text-error"
                          )}>
                            {move.type === 'in' ? "Entrada" : "Salida"}
                          </span>
                        </div>
                        <div className="col-span-2 text-center font-headline text-lg font-bold text-white">
                          {move.type === 'in' ? '+' : '-'}{move.quantity}
                        </div>
                        <div className="col-span-2 text-right text-[10px] text-tertiary font-medium uppercase truncate">
                          {move.userEmail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
