// Sistema central de iconos (lucide-react). En toda la UI usar <Icon name="..." />
// en lugar de emojis. Para agregar un icono nuevo: impórtalo aquí y añádelo al mapa.
import {
  ShoppingCart, Armchair, ReceiptText, HandCoins, Sandwich, Package,
  Warehouse, ArrowLeftRight, Banknote, ScrollText, FileMinus, FilePlus, Percent,
  ShoppingBag, Factory, Users, BarChart3, UserCog, ShieldCheck, Building2,
  Database, ClipboardList, Sun, Moon, ChevronDown, Tags, PartyPopper,
  BadgeDollarSign, FileText, Truck, CreditCard, Coins, UserRound, FolderTree,
  Landmark, Antenna, Plug, Circle, Calculator, Gift,
  Pencil, Trash2, X, Plus, Minus, DollarSign, Save, Check, Ban, RotateCw,
  ArrowLeft, ArrowRight, Shuffle, Lock, Snowflake, Menu, MapPin, Navigation, LocateFixed, ChefHat,
} from 'lucide-react';

const MAP = {
  // Navbar principal
  pedidos: ShoppingCart,
  mesas: Armchair,
  cocina: ChefHat,
  facturas: ReceiptText,
  cortesias: Gift,
  cuentas: HandCoins,
  productos: Sandwich,
  kits: Package,
  inventario: Package,
  tags: Tags,
  bodegas: Warehouse,
  movimientos: ArrowLeftRight,
  caja: Banknote,
  resoluciones: ScrollText,
  notas_credito: FileMinus,
  notas_debito: FilePlus,
  retenciones: Percent,
  compras: ShoppingBag,
  proveedores: Factory,
  clientes: Users,
  reportes: BarChart3,
  usuarios: UserCog,
  roles: ShieldCheck,
  empresa: Building2,
  maestros: Database,
  unidades: Calculator,
  auditoria: ClipboardList,
  // Submenú Maestros / DIAN
  sucursales: Building2,
  listas_precios: Tags,
  promociones: PartyPopper,
  comisiones: BadgeDollarSign,
  cotizaciones: FileText,
  remisiones: Truck,
  metodos_pago: CreditCard,
  pagos: Coins,
  terceros: UserRound,
  centros_costo: FolderTree,
  cuentas_contables: Calculator,
  impuestos: Landmark,
  eventos_dian: Antenna,
  logs_integraciones: Plug,
  // UI general
  sun: Sun,
  moon: Moon,
  chevronDown: ChevronDown,
  // Acciones
  edit: Pencil,
  delete: Trash2,
  close: X,
  add: Plus,
  minus: Minus,
  price: DollarSign,
  save: Save,
  check: Check,
  ban: Ban,
  reload: RotateCw,
  back: ArrowLeft,
  forward: ArrowRight,
  swap: Shuffle,
  lock: Lock,
  freeze: Snowflake,
  cash: Banknote,
  card: CreditCard,
  cart: ShoppingCart,
  receipt: ReceiptText,
  menu: Menu,
  mapa: MapPin,
  ubicacion: Navigation,
  gps: LocateFixed,
};

export function Icon({ name, size = 18, strokeWidth = 1.75, className, style }) {
  const Cmp = MAP[name] || Circle;
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden />;
}

export default Icon;
