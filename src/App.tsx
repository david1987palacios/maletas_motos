/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
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

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  current_stock: number;
  sku?: string;
  imageUrl?: string;
  created_at?: string;
}

interface Movement {
  id: string;
  product_id: string;
  user_id: string;
  type: 'ENTRY' | 'DISPATCH' | 'ADJUSTMENT';
  quantity: number;
  notes?: string;
  created_at: string;
  
  // Joined fields
  products?: { name: string, sku: string };
  profiles?: { email: string };
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

function handleSupabaseError(error: any) {
  console.error('Supabase Error: ', error);
  alert(`Error: ${error.message || String(error)}`);
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
  const [moveType, setMoveType] = useState<'ENTRY' | 'DISPATCH'>('ENTRY');
  const [quantity, setQuantity] = useState<number>(0);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Auth Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Data Fetching & Realtime
  useEffect(() => {
    if (!isAuthReady || !user) return;

    fetchData();

    // Listen to changes on products
    const productsSub = supabase.channel('public:products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchData)
      .subscribe();

    // Listen to changes on movements
    const movementsSub = supabase.channel('public:movements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(productsSub);
      supabase.removeChannel(movementsSub);
    };
  }, [isAuthReady, user]);

  const fetchData = async () => {
    const { data: prods, error: pError } = await supabase.from('products').select('*');
    if (pError) console.error(pError);
    else setProducts(prods || []);

    const { data: moves, error: mError } = await supabase
      .from('movements')
      .select('*, products(name, sku), profiles(email)')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (mError) console.error(mError);
    else setMovements(moves as any || []);
  };

  const handleEmailLogin = async (e: React.FormEvent, isSignUp: boolean) => {
    e.preventDefault();
    setIsAuthLoading(true);
    try {
      const { error } = isSignUp 
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      
      if (error) throw error;
      if (isSignUp) alert("Registro exitoso. Tu cuenta se ha credo, intenta entrar ahora o revisa tu correo si está activada la confirmación.");
    } catch (error: any) {
      alert(`Error al iniciar sesión: ${error.message}`);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = async (providerType: 'google' | 'facebook') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: providerType,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error(`${providerType} login failed:`, error);
      alert(`Error al iniciar sesión: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('products').update({
        name: editingProduct.name,
        sku: editingProduct.sku,
        price: Number(editingProduct.price),
        current_stock: Number(editingProduct.current_stock),
      }).eq('id', editingProduct.id);
      
      if (error) throw error;

      alert('Producto actualizado correctamente.');
      setIsEditing(false);
      setEditingProduct(null);
      fetchData();
    } catch (error) {
      handleSupabaseError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm("¿Está seguro de eliminar este producto del catálogo?")) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      alert("Producto eliminado correctamente.");
      fetchData();
    } catch (error) {
      handleSupabaseError(error);
    }
  };

  const handleDeleteMovement = async (movementId: string) => {
    if (!window.confirm("¿Está seguro de ocultar este movimiento? (En Supabase se requiere Admin para borrar)")) return;
    // Ocultar localmente si la base de datos no lo permite para usuarios normales
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

    if (moveType === 'DISPATCH' && product.current_stock < quantity) {
      setFormError(`Error: No hay suficiente stock. Stock actual: ${product.current_stock} unidades.`);
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      // Because we have a trigger in Supabase (update_stock_on_movement),
      // we ONLY need to insert the movement. The DB will handle the stock update automatically.
      const { error } = await supabase.from('movements').insert([{
        product_id: selectedProductId,
        user_id: user?.id,
        quantity: quantity,
        type: moveType,
        notes: "Movimiento Manual App"
      }]);

      if (error) throw error;

      // Reset form
      setSelectedProductId('');
      setQuantity(0);
      setFormError('');
      alert("Movimiento procesado correctamente.");
    } catch (error: any) {
      handleSupabaseError(error);
    } finally {
      setIsSubmitting(false);
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
    return products.reduce((acc, p) => acc + (p.current_stock * p.price), 0);
  }, [products]);

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

  if (!user && !isGuest) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-surface-container p-10 rounded-xl border border-white/5 text-center"
        >
          <h1 className="text-primary-container font-black tracking-tighter text-3xl uppercase mb-2">COMODIDA SOBRE RUEDAS</h1>
          <p className="font-headline text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-8">ACCESO AL SISTEMA</p>
          
          <form className="flex flex-col gap-4 mb-6">
            <input 
              type="email" 
              placeholder="Correo Electrónico" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-primary-container text-sm"
            />
            <input 
              type="password" 
              placeholder="Contraseña" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-primary-container text-sm"
            />
            <div className="flex gap-3 mt-2">
              <button 
                type="submit"
                onClick={(e) => handleEmailLogin(e, false)}
                disabled={isAuthLoading}
                className="flex-1 primary-gradient text-on-primary-fixed font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-all text-xs tracking-widest uppercase disabled:opacity-50"
              >
                Ingresar
              </button>
              <button 
                type="button"
                onClick={(e) => handleEmailLogin(e, true)}
                disabled={isAuthLoading}
                className="flex-1 bg-surface-container-highest text-white border border-white/10 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-all text-xs tracking-widest uppercase disabled:opacity-50"
              >
                Registrarme
              </button>
            </div>
          </form>

          <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-gray-500 text-xs font-bold uppercase tracking-widest">O usa</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => handleLogin('google')}
              className="w-full bg-[#EA4335]/10 border border-[#EA4335]/20 text-[#EA4335] hover:bg-[#EA4335]/20 font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              <UserIcon className="w-4 h-4" />
              <span className="font-headline text-xs uppercase tracking-widest">Google</span>
            </button>

            <button 
              onClick={() => handleLogin('facebook')}
              className="w-full bg-[#1877F2]/10 border border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/20 font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              <Facebook className="w-4 h-4" />
              <span className="font-headline text-xs uppercase tracking-widest">Facebook</span>
            </button>

            <button 
              onClick={() => setIsGuest(true)}
              className="w-full bg-white/5 border border-white/10 text-white hover:bg-white/10 font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-3 active:scale-95 transition-all mt-2"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span className="font-headline text-xs uppercase tracking-widest">Entrar sin cuenta</span>
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
                <button onClick={() => handleShare('whatsapp')} className="flex items-center gap-4 p-4 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/20 transition-all font-bold uppercase text-xs tracking-widest">
                  <MessageCircle className="w-5 h-5" /> WhatsApp
                </button>
                <button onClick={() => handleShare('facebook')} className="flex items-center gap-4 p-4 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/20 transition-all font-bold uppercase text-xs tracking-widest">
                  <Facebook className="w-5 h-5" /> Facebook
                </button>
                <button onClick={() => handleShare('google')} className="flex items-center gap-4 p-4 rounded-xl bg-[#EA4335]/10 border border-[#EA4335]/20 text-[#EA4335] hover:bg-[#EA4335]/20 transition-all font-bold uppercase text-xs tracking-widest">
                  <Mail className="w-5 h-5" /> Google (Gmail)
                </button>
                <button onClick={() => handleShare('instagram')} className="flex items-center gap-4 p-4 rounded-xl bg-[#E4405F]/10 border border-[#E4405F]/20 text-[#E4405F] hover:bg-[#E4405F]/20 transition-all font-bold uppercase text-xs tracking-widest">
                  <Instagram className="w-5 h-5" /> Instagram
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
                      value={editingProduct.current_stock}
                      onChange={(e) => setEditingProduct({...editingProduct, current_stock: parseInt(e.target.value) || 0})}
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
              onClick={() => alert("Módulo de compras en versión Supabase en camino.")}
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
                <span className="text-xs font-medium hidden lg:block">{user?.email || 'Invitado'}</span>
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
                    <p className="text-secondary mt-2">Monitoreo sincronizado con base de datos en tiempo real.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* Movement Form */}
                  <section className="lg:col-span-7 bg-surface-container rounded-xl p-8 border-l-4 border-primary-container">
                    <h3 className="font-headline text-xs font-bold uppercase tracking-widest text-secondary mb-8">Registro de Movimientos</h3>
                    <form onSubmit={handleMovement} className="space-y-8">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-secondary mb-3">Producto</label>
                        <select 
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg py-4 px-5 text-white focus:ring-2 focus:ring-primary-container focus:border-transparent transition-all"
                        >
                          <option value="">Seleccione un producto...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.sku} - {p.name} ({p.current_stock})</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-4 mb-4">
                        <button 
                          type="button" 
                          onClick={() => setMoveType('ENTRY')}
                          className={cn("flex-1 py-3 font-bold text-sm tracking-widest rounded transition-all", moveType === 'ENTRY' ? "bg-green-500 text-white" : "bg-white/5 text-secondary hover:bg-white/10")}
                        >
                          AGREGAR (+)
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setMoveType('DISPATCH')}
                          className={cn("flex-1 py-3 font-bold text-sm tracking-widest rounded transition-all", moveType === 'DISPATCH' ? "bg-error text-white" : "bg-white/5 text-secondary hover:bg-white/10")}
                        >
                          QUITAR (-)
                        </button>
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
                            min="1"
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
                      {movements.length === 0 && <p className="text-secondary text-sm">No hay movimientos registrados.</p>}
                      {movements.filter(m => !hiddenMovements.has(m.id)).slice(0, 5).map(move => (
                        <div 
                          key={move.id}
                          className={cn(
                            "relative bg-surface-container-low p-5 rounded-lg border-l-4 flex justify-between items-center group hover:bg-surface-container-highest transition-colors",
                            move.type === 'ENTRY' ? "border-green-500/50" : "border-error/50"
                          )}
                        >
                          <button 
                            onClick={() => handleDeleteMovement(move.id)}
                            className="absolute -right-2 -top-2 p-2 bg-surface border border-error/20 text-error rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-error-container hover:scale-110"
                            title="Ocultar movimiento"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <div className="flex flex-col gap-1">
                            <span className="font-headline text-sm font-bold text-white">{move.products?.name || 'Producto Desconocido'}</span>
                            <div className="flex items-center gap-3">
                              <span className={cn("text-[10px] font-bold uppercase", move.type === 'ENTRY' ? "text-green-500" : "text-error")}>
                                {move.type === 'ENTRY' ? "Entrada" : "Salida"}
                              </span>
                              <span className="text-[10px] text-tertiary tracking-wider uppercase">{move.profiles?.email?.split('@')[0] || move.user_id?.slice(0, 6)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="block font-headline text-lg font-bold text-white">
                              {move.type === 'ENTRY' ? '+' : '-'}{move.quantity}
                            </span>
                            <span className="text-[10px] text-secondary font-medium uppercase">
                              {new Date(move.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-gradient-to-br from-surface-container-highest to-surface-container rounded-xl p-8 border border-white/5">
                      <span className="text-primary-container text-[10px] font-black tracking-widest uppercase">Valor Actual de Inventario</span>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-secondary text-sm">$</span>
                        <span className="font-headline text-3xl font-bold text-white">{formatCurrency(totalInventoryValue).replace('$', '')}</span>
                        <span className="text-secondary text-xs ml-1">COP</span>
                      </div>
                      <p className="text-[10px] text-tertiary mt-2 font-medium">Sincronizado con base de datos principal</p>
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
                </div>

                <div className="bg-surface-container rounded-xl overflow-hidden border border-white/5">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-white/5">
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest">SKU</th>
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest">Producto</th>
                        <th className="px-8 py-4 font-headline text-xs font-black text-tertiary uppercase tracking-widest text-right">Precio</th>
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
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right font-headline text-sm font-bold">
                            <span className="text-secondary text-[10px] mr-1">$</span>
                            {p.price.toLocaleString()}
                          </td>
                          <td className="px-8 py-5 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-sm text-xs font-bold border bg-tertiary-container/10 text-tertiary border-white/5">
                              {p.current_stock} UNIDADES
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
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="col-span-2 flex flex-col pl-4">
                          <span className="text-xs font-bold text-white">{new Date(move.created_at).toLocaleDateString()}</span>
                          <span className="text-[10px] text-secondary">{new Date(move.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="col-span-4 font-headline text-sm font-bold text-white uppercase">{move.products?.name || 'Desconocido'}</div>
                        <div className="col-span-2 flex justify-center">
                          <span className={cn(
                            "px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter",
                            move.type === 'ENTRY' ? "bg-green-500/10 text-green-500" : "bg-error-container/20 text-error"
                          )}>
                            {move.type === 'ENTRY' ? "Entrada" : "Salida"}
                          </span>
                        </div>
                        <div className="col-span-2 text-center font-headline text-lg font-bold text-white">
                          {move.type === 'ENTRY' ? '+' : '-'}{move.quantity}
                        </div>
                        <div className="col-span-2 text-right text-[10px] text-tertiary font-medium uppercase truncate">
                          {move.profiles?.email || move.user_id?.slice(0, 6)}
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
