# 🎴 CardDex — SnapTCG Premium

**CardDex** es una herramienta profesional de gestión para jugadores de TCG (Trading Card Games). Permite escanear cartas físicamente, consultar precios en tiempo real y construir mazos competitivos de **Pokémon TCG** y **Magic: The Gathering** con validación de reglas avanzada.

![Versión](https://img.shields.io/badge/Versi%C3%B3n-2.0.0-gold)
![Tech](https://img.shields.io/badge/Tech-Vanilla_JS-blue)
![OCR](https://img.shields.io/badge/OCR-Tesseract.js-green)

---

## 🚀 Funcionalidades Principales

### 1. Escáner Automático (Estilo Manabox)
- **Escaneo Continuo**: No necesitas pulsar botones. La app analiza el flujo de video cada 1.5 segundos.
- **Detección Inteligente**: Recorta automáticamente el área del nombre de la carta para maximizar la precisión del OCR.
- **Feedback Visual**: Resplandor dinámico y badges de estado que indican cuando una carta ha sido leída con éxito.

### 2. Constructor de Mazos Pro
- **Validación de Formatos**:
    - **Pokémon**: Formato Estándar (60 cartas, max 4 copias).
    - **Magic**: Formato Estándar y **Commander/EDH** (100 cartas, singleton/1 copia).
- **Análisis de Composición (Métricas)**:
    - Desglose en tiempo real de Pokémon/Entrenadores/Energías o Criaturas/Tierras/Hechizos.
    - Barra de progreso dinámica que indica si el mazo es legal para torneo.
- **Gestión de Biblioteca**: Guarda múltiples mazos localmente y edítalos cuando quieras.

### 3. Consultas en Tiempo Real
- **Precios Actualizados**: Integración directa con **Scryfall** (Magic) y **Pokémon TCG API**.
- **Indicador de Posesión**: Al buscar cartas, la app te indica si ya tienes copias de esa carta en tu mazo actual mediante un badge visual.

---

## 🎨 Diseño y UX
- **Estética Neo-Brutalista Premium**: Diseño oscuro con efectos de "Glassmorphism" y contrastes optimizados.
- **Tematización Dinámica**: La interfaz cambia de color de acento según el juego seleccionado (Oro para Pokémon, Violeta para Magic).
- **Navegación Móvil**: Barra de navegación inferior optimizada para uso con el pulgar.
- **Micro-interacciones**: Efectos de escala, pop-ups y animaciones de carga (Skeletons) para una experiencia fluida.

---

## 🛠️ Stack Tecnológico
- **Frontend**: HTML5, CSS3 (Variables, Flexbox, Grid).
- **Lógica**: JavaScript Vanilla (ES6+).
- **OCR**: [Tesseract.js](https://tesseract.projectnaptha.com/).
- **APIs**:
    - [Scryfall API](https://scryfall.com/docs/api) para Magic: The Gathering.
    - [Pokémon TCG API](https://pokemontcg.io/) para Pokémon.

---

## 📦 Estructura del Proyecto
```bash
SnapTCG/
├── index.html         # Estructura semántica y accesible
├── css/
│   └── style.css      # Sistema de diseño unificado y animaciones
├── js/
│   ├── app.js         # Gestión de estados, temas y navegación
│   ├── api.js         # Integración con servicios externos
│   ├── scanner.js     # Lógica del OCR y flujo de cámara
│   └── deckbuilder.js # Reglas competitivas y métricas de mazos
└── README.md          # Documentación
```

---

## 💡 Cómo usar
1. Abre `index.html` en cualquier navegador moderno.
2. Selecciona tu juego preferido (Pokémon o Magic).
3. Usa el **Buscador** o el **Escáner en Vivo** para encontrar cartas.
4. Pulsa "Añadir al mazo" para empezar a construir.
5. En la pestaña **Mazos**, ajusta las cantidades y exporta tu lista para usarla en simuladores online (PTCGL, Arena, etc.).

---

Desarrollado con ❤️ para la comunidad de TCG.
