import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import connectDB from './db';

async function foo(event, data) {
  try {
    console.log(data)
    dialog.showMessageBox({ message: 'message back' })
  } catch (e) {
    dialog.showErrorBox('Ошибка', e)
  }
}


async function executeQuery(query, params) {
  const client = await connectDB();

  try {
    const res = await client.query(query, params);
    return res.rows;
  } catch (e) {
    dialog.showErrorBox("Не удалось запросить данные", e);
  } finally {
    client.end();
  }
}

async function getPartners(event) {
  try {
    const partners = await executeQuery(`
      SELECT id, type_name, partner_name, director_name, phone, rating,
      CASE
        WHEN sales_sum <= 10000 OR sales_sum IS NULL THEN 0
        WHEN sales_sum > 10000 AND sales_sum <= 50000 THEN 5
        WHEN sales_sum > 50000 AND sales_sum <= 300000 THEN 10
        WHEN sales_sum > 300000 THEN 15
      END AS discount
      FROM (
        SELECT 
          partners.id, partner_types.type_name, partners.partner_name, director_name, phone, rating,
          SUM(partner_products.products_count) AS sales_sum
        FROM partners
        LEFT JOIN partner_products
        ON partners.id = partner_products.id_partner
        LEFT JOIN partner_types
        ON partners.id_partner_type = partner_types.id
        GROUP BY partners.id, partner_types.type_name
        ORDER BY partners.id
      )
      ORDER BY id;
    `);
    return partners;
  } catch (e) {
    dialog.showErrorBox("Не удалось получить список партнеров", e);
  }
}

async function createPartner(event, data) {
  const {
    partner_type,
    partner_name,
    director_name,
    email,
    phone,
    address,
    inn,
    rating,
  } = data;

  try {
    const res = await executeQuery(
      `
      SELECT id
      FROM partner_types
      WHERE type_name = $1`,
      [partner_type]
    );

    const intRating = parseInt(rating);
    const typeId = res1[0].id;

    const insertRes = await executeQuery(
      `
      INSERT INTO public.partners(
	      id_partner_type, partner_name, director_name, email, phone, address, inn, rating)
	      VALUES ($1, $2, $3, $4, $5, $6, $7, $8); 
    `,
      [
        typeId,
        partner_name,
        director_name,
        email,
        phone,
        address,
        inn,
        intRating,
      ]
    );
  } catch (e) {
    dialog.showErrorBox("Не удалось получить список партнеров", e);
  }
}

async function updatePartner(event, partner) {
  const { id, type, name, ceo, email, phone, address, rating } = partner;

  try {
    await global.dbclient.query(`UPDATE partners
      SET name = '${name}', organization_type = '${type}', ceo='${ceo}', email='${email}', phone='${phone}', address='${address}', rating='${rating}'
      WHERE partners.id = ${id};`)
    dialog.showMessageBox({ message: 'Успех! Данные обновлены' })
    return;
  } catch (e) {
    dialog.showErrorBox('Невозможно создать пользователя', 'Такой пользователь уже есть')
    return ('error')
  }
}


function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  global.dbclient = await connectDB();

  ipcMain.handle('sendSignal', foo)
  ipcMain.handle("getPartners", getPartners);
  ipcMain.handle("createPartner", createPartner);

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
