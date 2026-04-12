/* ═══════════════════════════════════════════════════════════════
   shared.js  —  Screen Intelligence · core data & utilities
   Loaded by phonev4.html BEFORE any tab render script.
   Sections:
     1. DEVICE_SUMMARY  — CSV loader
     2. FEATURE_LABELS  — human-readable feature names
     3. APP_CAT / SYS_PAT — app category map
     4. CAT / NAMES — display metadata
     5. STATE — global runtime vars
     6. BOOT — async entry point (loads CSV → calls loadData)
     7. DATA PROCESSING — process()
     8. HELPERS — fhm, fdow, animFills, pad2
     9. TAB SWITCH — switchTab()
═══════════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────────────────────
   1. DEVICE SUMMARY — loaded at runtime from assets/device_summary.csv
   No hardcoded data. Populated before the app boots.
───────────────────────────────────────────────────────────── */
let DEVICE_SUMMARY = {};

const SKIP_COLS = new Set([
  'device_id','total_days','total_rows','missing_buckets_before',
  'total_expected_buckets','final_total_buckets','client_version',
  'notifications','unlocks','accuracy','f1_score'
]);

async function loadDeviceSummaryCSV() {
  try {
    const resp = await fetch('./assets/device_summary.csv');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map(h => h.trim());
    const result = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',');
      const did = (cols[0] || '').trim();
      if (!did) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = cols[idx] !== undefined ? cols[idx].trim() : '0'; });
      const features = {};
      headers.forEach(h => {
        if (SKIP_COLS.has(h)) return;
        const v = parseFloat(row[h]);
        if (!isNaN(v)) features[h] = v;
      });
      result[did] = {
        accuracy : parseFloat(row['accuracy'])  || 0,
        f1_score : parseFloat(row['f1_score'])  || 0,
        features
      };
    }
    DEVICE_SUMMARY = result;
    console.log('[AI Profile] CSV loaded —', Object.keys(result).length, 'devices');
  } catch(e) {
    console.error('[AI Profile] Failed to load device_summary.csv:', e);
  }
}


/* ─────────────────────────────────────────────────────────────
   2. FEATURE LABELS — edit here to rename any feature in the UI
───────────────────────────────────────────────────────────── */
const FEAT_LABELS = {
  total_time:'Total Screen Time',total_time_spent:'Screen Time (cap)',
  opens_intensity:'Opens Intensity',opens:'Total Opens',num_apps:'Apps Used',
  dopamine_score:'Dopamine Score',micro_ratio:'Micro-Session Ratio',
  fragmentation:'Session Fragmentation',session_fragmentation:'Session Frag.',
  behavioral_instability:'Behavioural Instability',behavior_risk_score:'Risk Score',
  night_intensity:'Night Intensity',is_night:'Night Usage Flag',
  usage_velocity:'Usage Velocity',usage_acceleration:'Usage Acceleration',
  roll_std_3:'3-Bucket Volatility',roll_std_12:'12-Bucket Volatility',
  rolling_mean_3:'3-Bucket Avg',rolling_mean_6:'6-Bucket Avg',
  rolling_std_3:'3-Bucket Std',rolling_std_6:'6-Bucket Std',
  entertainment_time:'Entertainment',social_time:'Social Media',
  browser_time:'Browsing',productivity_time:'Productive',
  knowledge_time:'Learning',communication_time:'Communication',
  payment_time:'Payment Apps',shop_time:'Shopping',
  utility_time:'Utilities',gps_time:'Navigation',health_time:'Health',
  week_day:'Day of Week',week_day_sin:'Weekday (sin)',week_day_cos:'Weekday (cos)',
  week_end:'Weekend Flag',week_end_sin:'Weekend (sin)',week_end_cos:'Weekend (cos)',
  hour:'Hour of Day',hour_sin:'Hour (sin)',hour_cos:'Hour (cos)',
  bucket_sin:'Bucket (sin)',bucket_cos:'Bucket (cos)',bucket_index:'Bucket Index',
  day_period:'Day Period',day_sin:'Day Period (sin)',day_cos:'Day Period (cos)',
  entropy:'Usage Entropy',focus_score:'Focus Score',overuse_intensity:'Overuse Intensity',
  overuse_ratio:'Overuse Ratio',is_scaled:'Capped Bucket',
  attention_fragmentation:'Attention Frag.',micro:'Micro Sessions',
  number_app_used:'Apps Count',loop_addiction_score:'Loop Addiction',
  target_t1:'Target T+1',target_t3:'Target T+3',target_t6:'Target T+6',
  system_time:'System',other_time:'Other',
};


/* ─────────────────────────────────────────────────────────────
   3. APP CATEGORY MAP — maps package name → category string
   Add new apps here.  Category keys: entertainment, social, shop,
   browser, productivity, knowledge, communication, payment,
   utility, health, gps, system, other
───────────────────────────────────────────────────────────── */
const APP_CAT={"advanced.scientific.calculator.calc991.plus":"productivity","ai.perplexity.app.android":"productivity","all.documentreader.filereader.office.viewer":"productivity","anddea.youtube.music":"entertainment","android":"system","app.blinkit.onboarding":"shop","app.netmirror.netmirrornew":"entertainment","app.revanced.android.youtube":"entertainment","authenticator.two.factor.authentication.otp":"utility","badh.busyness.app":"productivity","cn.wps.moffice_eng":"knowledge","cn.wps.xiaomi.abroad.lite":"system","com.Dominos":"shop","com.activision.callofduty.shooter":"entertainment","com.adobe.lrmobile":"productivity","com.adobe.reader":"productivity","com.adobe.scan.android":"productivity","com.alokmandavgane.hinducalendar":"productivity","com.amazon.avod.thirdpartyclient":"shop","com.android.bips":"system","com.android.camera":"entertainment","com.android.chrome":"browser","com.android.contacts":"communication","com.android.credentialmanager":"system","com.android.deskclock":"system","com.android.dialer":"communication","com.android.htmlviewer":"system","com.android.incallui":"communication","com.android.intentresolver":"system","com.android.keychain":"utility","com.android.launcher":"system","com.android.launcher3":"system","com.android.mms":"system","com.android.mtp":"system","com.android.phone":"communication","com.android.printspooler":"system","com.android.providers.downloads.ui":"system","com.android.server.telecom":"communication","com.android.settings":"system","com.android.settings.intelligence":"system","com.android.soundpicker":"system","com.android.soundrecorder":"productivity","com.android.stk":"system","com.android.stk2":"system","com.android.systemui":"system","com.android.thememanager":"utility","com.android.updater":"system","com.android.vending":"system","com.android.vpndialogs":"system","com.anthropic.claude":"knowledge","com.app.cricketapp":"entertainment","com.apple.android.music":"entertainment","com.application.zomato":"shop","com.application.zomato.district":"shop","com.arlosoft.macrodroid":"knowledge","com.astrotalk":"utility","com.aum.nammametro":"gps","com.azure.authenticator":"utility","com.balancehero.truebalance":"payment","com.bbk.SuperPowerSave":"system","com.bbk.updater":"system","com.bharathi.shreerama":"entertainment","com.bigbasket.mobileapp":"shop","com.blinkslabs.blinkist.android":"productivity","com.bmtc.bmtcavls":"gps","com.boAt.hearables":"entertainment","com.branch_international.branch.branch_demo_android":"payment","com.brave.browser":"browser","com.bt.bms":"entertainment","com.buyhatke.assistant":"shop","com.camerasideas.instashot":"productivity","com.careerwill.careerwillapp":"knowledge","com.cashkaro":"shop","com.chess":"entertainment","com.compass.digital.direction.qiblafinder.prayertimes":"utility","com.confirmtkt.lite":"gps","com.cricheroes.cricheroes.alpha":"entertainment","com.crrepa.band.dafit":"health","com.cv.docscanner":"productivity","com.dbtkarnataka":"utility","com.dddev.gallery.album.photo.editor":"utility","com.delphicoder.flud":"utility","com.desoline.android.pdfreader.lite":"productivity","com.dev47apps.droidcam":"productivity","com.digilocker.android":"productivity","com.discord":"communication","com.dogerescue.drawpuzzle.save":"entertainment","com.domobile.applock.ind":"utility","com.done.faasos":"utility","com.dreamplug.androidapp":"payment","com.dts.freefiremax":"entertainment","com.dubox.drive":"utility","com.duokan.phone.remotecontroller":"utility","com.duolingo":"productivity","com.dywx.larkplayer":"entertainment","com.ea.gp.fifamobile":"entertainment","com.eterno":"utility","com.example.edgedetector":"utility","com.example.gpsupdate":"gps","com.example.gpsuploader":"gps","com.example.productiveagent5":"system","com.example.productiveagent52":"system","com.example.usagepredictor":"system","com.facebook.appmanager":"social","com.facebook.katana":"social","com.facebook.stella":"social","com.fast.free.unblock.secure.vpn":"utility","com.fastbanking":"payment","com.fatakpay":"payment","com.fedmobile":"payment","com.fingersoft.hillclimb":"entertainment","com.finshell.fin":"payment","com.firebolttpro.watch":"utility","com.flipkart.android":"shop","com.fluffyfairygames.idleminertycoon":"entertainment","com.gallery.player":"entertainment","com.ge.capital.konysbiapp":"payment","com.github.android":"knowledge","com.google.android.GoogleCamera":"utility","com.google.android.accessibility.switchaccess":"system","com.google.android.apps.adm":"utility","com.google.android.apps.authenticator2":"other","com.google.android.apps.bard":"knowledge","com.google.android.apps.chromecast.app":"browser","com.google.android.apps.classroom":"productivity","com.google.android.apps.docs":"knowledge","com.google.android.apps.docs.editors.docs":"productivity","com.google.android.apps.docs.editors.sheets":"productivity","com.google.android.apps.fitness":"health","com.google.android.apps.googleassistant":"productivity","com.google.android.apps.maps":"knowledge","com.google.android.apps.messaging":"social","com.google.android.apps.nbu.files":"utility","com.google.android.apps.nbu.paisa.user":"utility","com.google.android.apps.nexuslauncher":"system","com.google.android.apps.photos":"entertainment","com.google.android.apps.photosgo":"entertainment","com.google.android.apps.restore":"system","com.google.android.apps.safetyhub":"utility","com.google.android.apps.subscriptions.red":"entertainment","com.google.android.apps.tachyon":"communication","com.google.android.apps.translate":"productivity","com.google.android.apps.wellbeing":"health","com.google.android.apps.youtube.music":"entertainment","com.google.android.calculator":"utility","com.google.android.calendar":"utility","com.google.android.captiveportallogin":"browser","com.google.android.cellbroadcastreceiver":"system","com.google.android.contacts":"communication","com.google.android.deskclock":"utility","com.google.android.dialer":"communication","com.google.android.documentsui":"knowledge","com.google.android.gm":"system","com.google.android.gms":"system","com.google.android.googlequicksearchbox":"browser","com.google.android.googlesdksetup":"system","com.google.android.healthconnect.controller":"health","com.google.android.inputmethod.latin":"system","com.google.android.keep":"utility","com.google.android.markup":"utility","com.google.android.packageinstaller":"system","com.google.android.permissioncontroller":"system","com.google.android.photopicker":"entertainment","com.google.android.projection.gearhead":"gps","com.google.android.providers.media.module":"system","com.google.android.settings.intelligence":"system","com.google.android.tts":"utility","com.google.android.videos":"entertainment","com.google.android.youtube":"entertainment","com.google.ar.lens":"utility","com.grofers.customerapp":"shop","com.grofers.customerapp.lit":"shop","com.hdfcbank.android.now":"payment","com.heytap.browser":"browser","com.heytap.pictorial":"system","com.hirist.jobseeker":"utility","com.hmdglobal.app.camera":"entertainment","com.hmdglobal.app.fmradio":"entertainment","com.honeygain.make.money":"payment","com.ideopay.user":"payment","com.idle.chop":"entertainment","com.indiabix":"utility","com.indus.appstore":"system","com.infrasoft.uboi":"payment","com.inmobi.weather":"system","com.instagram":"social","com.instagram.android":"social","com.instagram.barcelona":"social","com.jio.myjio":"payment","com.jio.web":"browser","com.jpl.jiomart":"shop","com.justvend":"shop","com.kannada.keyboard.for.android":"utility","com.kiloo.subwaysurf":"entertainment","com.king.candycrushsaga":"entertainment","com.kreditbee.android":"payment","com.ksrtc.awatar.new":"gps","com.lenskart.app":"shop","com.linkedin.android":"social","com.llamalab.automate":"system","com.ludo.king":"entertainment","com.machinelearningforsmallbusiness.leetcodepython":"productivity","com.magicpin.local":"shop","com.manash.purplle":"shop","com.meesho.supply":"shop","com.mi.android.globalFileexplorer":"utility","com.mi.android.globallauncher":"system","com.mi.android.globalminusscreen":"system","com.mi.appfinder":"shop","com.mi.globalminusscreen":"system","com.microsoft.appmanager":"utility","com.microsoft.copilot":"productivity","com.microsoft.emmx":"browser","com.microsoft.office.excel":"productivity","com.microsoft.office.officehubrow":"productivity","com.microsoft.office.outlook":"communication","com.microsoft.office.powerpoint":"productivity","com.microsoft.skydrive":"utility","com.microsoft.teams":"communication","com.microsoft.xboxone.smartglass":"entertainment","com.milink.service":"system","com.miui.android.fashiongallery":"browser","com.miui.aod":"system","com.miui.bugreport":"system","com.miui.calculator":"productivity","com.miui.cleaner":"utility","com.miui.cloudservice":"system","com.miui.compass":"gps","com.miui.fm":"entertainment","com.miui.gallery":"entertainment","com.miui.global.packageinstaller":"system","com.miui.home":"system","com.miui.mediaeditor":"entertainment","com.miui.mediaviewer":"entertainment","com.miui.miservice":"system","com.miui.mishare.connectivity":"utility","com.miui.misound":"system","com.miui.notes":"productivity","com.miui.notification":"system","com.miui.player":"entertainment","com.miui.screenrecorder":"entertainment","com.miui.screenshot":"utility","com.miui.securityadd":"system","com.miui.securitycenter":"system","com.miui.securitycore":"system","com.miui.thirdappassistant":"system","com.miui.weather2":"utility","com.motorola.actions":"system","com.motorola.batterycare":"utility","com.motorola.camera5":"utility","com.motorola.coresettingsext":"utility","com.motorola.dolby.dolbyui":"utility","com.motorola.genie":"utility","com.motorola.help":"other","com.motorola.journal":"productivity","com.motorola.launcher3":"system","com.motorola.motosecurecore":"system","com.motorola.msimsettings":"system","com.motorola.mykey":"utility","com.motorola.personalize":"utility","com.motorola.screenshoteditor":"utility","com.motorola.securevault":"system","com.motorola.securityhub":"system","com.motorola.timeweatherwidget":"system","com.motorola.uxcore":"system","com.mpokket.app":"payment","com.mxtech.videoplayer.ad":"entertainment","com.myairtelapp":"utility","com.myntra.android":"shop","com.nekki.shadowfight":"entertainment","com.nemo.vidmate":"entertainment","com.net.pvr":"entertainment","com.netflix.mediaclient":"entertainment","com.newleaf.app.android.victor":"payment","com.nextbillion.groww":"payment","com.nomonkeys.ballblast":"entertainment","com.ojassoft.astrosage":"knowledge","com.olacabs.customer":"gps","com.olx.southasia":"shop","com.oneplus.deskclock":"utility","com.oneplus.gallery":"utility","com.openai.chatgpt":"knowledge","com.oplus.camera":"utility","com.oplus.encryption":"system","com.oplus.phonemanager":"utility","com.oplus.safecenter":"system","com.oplus.screenshot":"utility","com.oplus.wirelesssettings":"system","com.oppo.quicksearchbox":"utility","com.osp.app.signin":"system","com.ovelin.guitartuna":"knowledge","com.pas.webcam":"utility","com.paypal.android.p2pmobile":"payment","com.pdfeditor.pdfeditorandriod":"productivity","com.phonepe.app":"payment","com.plato.android":"entertainment","com.playgendary.bowmasters":"entertainment","com.playit.videoplayer":"entertainment","com.pubg.imobile":"entertainment","com.rapido.passenger":"gps","com.rcflightsim.cvplane2":"entertainment","com.realvnc.viewer.android":"system","com.reddit.frontpage":"entertainment","com.redlinegames.attackhole":"entertainment","com.revanced.net.revancedmanager":"utility","com.ril.ajio":"shop","com.rsupport.rs.activity.rsupport.aas2":"utility","com.run.tower.defense":"entertainment","com.samsung.android.app.contacts":"communication","com.samsung.android.app.dressroom":"system","com.samsung.android.app.notes":"productivity","com.samsung.android.app.routines":"system","com.samsung.android.app.sharelive":"communication","com.samsung.android.app.smartcapture":"system","com.samsung.android.app.soundpicker":"system","com.samsung.android.app.telephonyui":"system","com.samsung.android.app.tips":"system","com.samsung.android.bixby.agent":"system","com.samsung.android.calendar":"utility","com.samsung.android.dialer":"utility","com.samsung.android.dynamiclock":"utility","com.samsung.android.emergency":"system","com.samsung.android.forest":"health","com.samsung.android.honeyboard":"system","com.samsung.android.incallui":"communication","com.samsung.android.lool":"utility","com.samsung.android.messaging":"communication","com.samsung.android.oneconnect":"system","com.samsung.android.privacydashboard":"system","com.samsung.android.samsungpassautofill":"system","com.samsung.android.scloud":"system","com.samsung.android.secsoundpicker":"system","com.samsung.android.smartmirroring":"utility","com.samsung.android.smartsuggestions":"utility","com.samsung.android.spaymini":"payment","com.samsung.android.stickercenter":"system","com.samsung.android.themestore":"system","com.samsung.android.video":"entertainment","com.samsung.app.newtrim":"entertainment","com.samsung.crane":"system","com.samsung.ecomm.global.in":"shop","com.samsung.knox.securefolder":"utility","com.sbi.lotusintouch":"payment","com.sec.android.app.camera":"utility","com.sec.android.app.clockpackage":"utility","com.sec.android.app.launcher":"system","com.sec.android.app.myfiles":"utility","com.sec.android.app.popupcalculator":"utility","com.sec.android.app.samsungapps":"shop","com.sec.android.app.sbrowser":"browser","com.sec.android.app.soundalive":"system","com.sec.android.daemonapp":"utility","com.sec.android.gallery3d":"entertainment","com.sec.android.mimage.photoretouching":"entertainment","com.server.auditor.ssh.client":"knowledge","com.shopping.limeroad":"shop","com.si.heynote":"productivity","com.smallcase.android":"payment","com.snapchat.android":"social","com.spotify.music":"entertainment","com.tailscale.ipn":"productivity","com.tallteam.citychase":"entertainment","com.termux":"knowledge","com.tiffit.user":"shop","com.tmstore.robu.in":"shop","com.truecaller":"communication","com.trustedapp.pdfreaderpdfviewer":"productivity","com.tvscs.tvscreditapp":"payment","com.twitter.android":"entertainment","com.ubercab":"gps","com.vblast.flipaclip":"entertainment","com.video.fun.app":"entertainment","com.vincentb.MobControl":"entertainment","com.vivo.appstore":"shop","com.vivo.assistantfunction":"system","com.vivo.browser":"browser","com.vivo.calculator":"utility","com.vivo.gallery":"entertainment","com.vivo.globalsearch":"browser","com.vivo.imanager":"utility","com.vivo.magazine":"shop","com.vivo.notes":"productivity","com.vivo.screenagent":"system","com.vivo.share":"utility","com.vivo.smartshot":"system","com.vivo.stepcount":"health","com.vivo.systemuiplugin":"system","com.vivo.weather":"utility","com.whatsapp":"social","com.whatsapp.w4b":"social","com.whereismytrain.android":"gps","com.whizdm.moneyview.loans":"payment","com.wssyncmldm":"system","com.xiaomi.account":"system","com.xiaomi.aiasst.vision":"utility","com.xiaomi.aicr":"system","com.xiaomi.bluetooth":"utility","com.xiaomi.calendar":"productivity","com.xiaomi.discover":"entertainment","com.xiaomi.glgm":"system","com.xiaomi.midrop":"utility","com.xiaomi.mipicks":"shop","com.xiaomi.scanner":"utility","com.xiaomi.wearable":"health","com.yozo.vivo.office":"productivity","com.zeptoconsumerapp":"shop","com.zip.unzip.zipextractor.raropener.zipfile":"utility","cris.org.in.prs.ima":"gps","eu.kanade.tachiyomi.j2k":"entertainment","free.programming.programming":"productivity","free.vpn.unblock.proxy.turbovpn":"utility","imagetopdf.pdfconverter.jpgtopdf.pdfeditor":"productivity","in.amazon.mShop.android.shopping":"shop","in.burgerking.android":"shop","in.cricketexchange.app.cricketexchange":"entertainment","in.gov.uidai.mAadhaarPlus":"productivity","in.hanafintech":"payment","in.irisbyyes.app":"payment","in.juspay.nammayatri":"payment","in.org.npci.upiapp":"payment","in.pricehistory.app":"shop","in.rebase.app":"social","in.startv.hotstar":"entertainment","in.swiggy.android":"shop","in.swiggy.android.instamart":"shop","in.thirdwavecoffee.android":"shop","indwin.c3.shareapp":"utility","instagram.video.downloader.story.saver.ig":"social","intelligems.torrdroid":"entertainment","io.voodoo.dune":"entertainment","io.voodoo.paper2":"entertainment","jp.co.shueisha.mangaplus":"entertainment","jp.or.nhk.nhkworld.tv":"entertainment","live.friend.dostt":"social","miui.systemui.plugin":"system","money.jupiter":"payment","money.super.payments":"payment","naukriApp.appModules.login":"productivity","net.one97.paytm":"payment","net.oneplus.weather":"utility","net.openvpn.openvpn":"utility","org.chromium.webapk.a603b9191b7a7c4d7_v2":"browser","org.cris.aikyam":"gps","org.fdroid.fdroid":"system","org.kde.kdeconnect_tp":"utility","org.mozilla.firefox":"browser","org.sadhguru.miracleofmind":"health","org.telegram.messenger":"social","pdf.pdfreader.viewer.editor.free":"productivity","pes.pesu":"knowledge","placementapp.com":"productivity","python.programming.coding.python3.development":"productivity","ru.ok.android":"social","ryey.easer.beta":"system","sortpuz.water.sort.puzzle.game":"entertainment","tv.accedo.airtel.wynk":"entertainment","us.zoom.videomeetings":"communication"};

/* System app regex patterns — matched if not in APP_CAT */
const SYS_PAT=[/^com\.android\./,/^com\.google\.android\.(gms|gsf|packageinstaller|permissioncontroller|setupwizard|inputmethod|accessibility|cellbroadcast|providers\.media|settings\.intelligence)/,/^com\.google\.android\.apps\.(nexuslauncher|restore)$/,/^com\.google\.android\.(gm|gms)$/,/^com\.miui\.(home|miservice|securityadd|securitycore|notification|aod|misound|bugreport|cloudservice|thirdappassistant|global\.packageinstaller)$/,/^com\.xiaomi\.(account|aicr|glgm)$/,/^com\.samsung\.android\.(bixby|themestore|honeyboard|emergency|oneconnect|privacydashboard|samsungpassautofill|scloud|secsoundpicker|stickercenter|crane|dressroom|app\.(routines|smartcapture|soundpicker|telephonyui|tips))$/,/^com\.(sec\.android\.app\.launcher|vivo\.(smartshot|systemuiplugin)|bbk\.|osp\.app|wssyncmldm|indus\.appstore|llamalab\.automate|realvnc|milink\.service)/,/^(miui\.systemui|org\.fdroid|ryey\.easer)/,/^com\.example\.(productiveagent|usagepredictor)/,/^com\.mi\.(android\.(globallauncher|globalminusscreen)|globalminusscreen)$/];

function isSys(p){if(APP_CAT[p]==='system')return true;return SYS_PAT.some(r=>r.test(p))}
function getCat(p){if(isSys(p))return'system';return APP_CAT[p]||'other'}


/* ─────────────────────────────────────────────────────────────
   4. DISPLAY METADATA — category colours/icons & friendly app names
   Edit CAT to change how each category looks.
───────────────────────────────────────────────────────────── */
const CAT={
  entertainment:{c:'#f16b6b',ic:'🎬',lb:'Entertainment'},
  social:       {c:'#f07d3e',ic:'💬',lb:'Social Media'},
  shop:         {c:'#f5b942',ic:'🛒',lb:'Shopping'},
  browser:      {c:'#5b8df8',ic:'🌐',lb:'Browser'},
  productivity: {c:'#3dd68c',ic:'✅',lb:'Productive'},
  knowledge:    {c:'#9d74f5',ic:'📚',lb:'Knowledge'},
  communication:{c:'#60a5fa',ic:'📞',lb:'Comms'},
  payment:      {c:'#10b981',ic:'💳',lb:'Payments'},
  utility:      {c:'#6b7a9e',ic:'🔧',lb:'Utility'},
  health:       {c:'#f0abfc',ic:'❤️', lb:'Health'},
  gps:          {c:'#3dd68c',ic:'📍',lb:'Navigation'},
  other:        {c:'#2a3148',ic:'📱',lb:'Other'},
};

/* Add or edit friendly app names here */
const NAMES={"com.google.android.youtube":"YouTube","app.revanced.android.youtube":"YouTube ReVanced","com.instagram.android":"Instagram","com.instagram.barcelona":"Threads","com.whatsapp":"WhatsApp","com.whatsapp.w4b":"WhatsApp Biz","com.facebook.katana":"Facebook","com.netflix.mediaclient":"Netflix","in.startv.hotstar":"Hotstar","com.spotify.music":"Spotify","com.twitter.android":"Twitter / X","org.telegram.messenger":"Telegram","com.snapchat.android":"Snapchat","com.linkedin.android":"LinkedIn","com.reddit.frontpage":"Reddit","com.android.chrome":"Chrome","com.brave.browser":"Brave","org.mozilla.firefox":"Firefox","com.microsoft.emmx":"Edge","com.google.android.apps.maps":"Google Maps","com.phonepe.app":"PhonePe","net.one97.paytm":"Paytm","com.google.android.apps.bard":"Gemini","com.openai.chatgpt":"ChatGPT","com.anthropic.claude":"Claude AI","in.swiggy.android":"Swiggy","com.zeptoconsumerapp":"Zepto","app.blinkit.onboarding":"Blinkit","com.bigbasket.mobileapp":"BigBasket","com.ludo.king":"Ludo King","com.king.candycrushsaga":"Candy Crush","com.duolingo":"Duolingo","us.zoom.videomeetings":"Zoom","com.microsoft.teams":"Teams","com.google.android.apps.youtube.music":"YT Music","com.mxtech.videoplayer.ad":"MX Player","com.truecaller":"Truecaller","com.termux":"Termux","com.miui.gallery":"Gallery","com.google.android.apps.photos":"Photos","com.flipkart.android":"Flipkart","com.myntra.android":"Myntra","in.amazon.mShop.android.shopping":"Amazon","com.microsoft.office.outlook":"Outlook","com.github.android":"GitHub","com.careerwill.careerwillapp":"CareerWill","com.samsung.android.video":"Samsung Video","com.xiaomi.discover":"Mi News","com.miui.player":"Mi Music","in.swiggy.android.instamart":"Swiggy Instamart","com.application.zomato.district":"Zomato","com.discord":"Discord","ai.perplexity.app.android":"Perplexity","com.pubg.imobile":"PUBG Mobile","com.dts.freefiremax":"Free Fire Max","com.ubercab":"Uber","com.olacabs.customer":"Ola"};

/* Returns a short display name for any package */
function fname(p){
  if(NAMES[p])return NAMES[p];
  const pts=p.split('.');
  const l=pts[pts.length-1].replace(/([A-Z])/g,' $1').replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim();
  return l.length>2?l:pts.slice(-2).join('.');
}

/* Colour palette for ranked lists */
const COLORS=['#f16b6b','#f07d3e','#f5b942','#5b8df8','#9d74f5','#3dd68c','#60a5fa','#f0abfc','#10b981','#6b7a9e'];


/* ─────────────────────────────────────────────────────────────
   5. RUNTIME STATE — global vars shared across all tab scripts
───────────────────────────────────────────────────────────── */
const PAR    = new URLSearchParams(location.search);
const DEVICE = PAR.get('device_id');

let G           = {};   // aggregate totals
let allDays     = [];   // sorted array of date strings with data
let dayMap      = {};   // per-day breakdown
let curDate     = '';   // currently viewed date
let dayChartInst= null; // Chart.js instance for By-Day hourly chart
let catFilterActive = 'all';
let bucketMatrix= {};   // dt → 96-bucket array
let dayP75      = {};   // dt → 75th-pct bucket seconds (heavy threshold)

const HEAVY_ABS = 150;  // absolute min seconds to count as heavy bucket

function classifyHeavy(bi, dt){
  const bm = bucketMatrix[dt];
  if(!bm) return false;
  const s = bm[bi].secs;
  if(s <= HEAVY_ABS) return false;
  return s >= (dayP75[dt] ?? HEAVY_ABS);
}
function computeDayP75(dt){
  const bm = bucketMatrix[dt];
  if(!bm) return HEAVY_ABS;
  const v = bm.map(b=>b.secs).filter(s=>s>0).sort((a,b)=>a-b);
  if(!v.length) return HEAVY_ABS;
  return v[Math.min(Math.floor(v.length*.75), v.length-1)];
}


/* ─────────────────────────────────────────────────────────────
   6. BOOT — async entry point
   Runs on DOMContentLoaded (triggered by phonev4.html).
   Order: set label → load CSV → load usage data OR show no-device UI
───────────────────────────────────────────────────────────── */
document.getElementById('devLabel').textContent =
  DEVICE ? 'Device: ' + DEVICE : 'No device_id in URL';

(async function boot(){
  document.getElementById('loadTxt').textContent = 'Loading AI model data…';
  await loadDeviceSummaryCSV();   // always load CSV first

  if(!DEVICE){
    // No device in URL — show placeholder, still render AI Profile demo
    document.getElementById('loader').innerHTML =
      '<div style="padding:36px;text-align:center;color:var(--mu)">' +
      '<div style="font-size:40px;margin-bottom:12px">📵</div>' +
      '<div style="font-size:14px;font-weight:600">No device linked.' +
      '<br><span style="font-size:12px;font-weight:400">Add ?device_id=YOUR_ID to the URL</span></div></div>';
    setTimeout(() => renderAIProfile(), 400);
  } else {
    loadData();
  }
})();

/* Fetch usage data from API and kick off processing */
async function loadData(){
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  loader.style.opacity = '1';
  loader.classList.remove('out');
  document.getElementById('loadTxt').textContent = 'Fetching your data…';
  try {
    const r = await fetch('/api/phonev2/usage/' + DEVICE);
    const j = await r.json();
    if(!j.ok || !j.data || !j.data.length){
      loader.innerHTML = '<div style="padding:36px;text-align:center;color:var(--mu);font-size:13px">No data found for this device.</div>';
      renderAIProfile();
      return;
    }
    document.getElementById('loadTxt').textContent = 'Crunching numbers…';
    process(j.data);
  } catch(e){
    loader.innerHTML =
      `<div style="padding:36px;text-align:center"><div style="font-size:28px;margin-bottom:10px">⚠️</div>` +
      `<div style="color:var(--red);font-size:13px;font-weight:600">Failed to load</div>` +
      `<div style="color:var(--mu);font-size:11px;margin-top:6px">${e.message}</div></div>`;
    renderAIProfile();
  }
}

/* Reload button — re-fetches CSV then data */
function doReload(){
  (async()=>{ await loadDeviceSummaryCSV(); loadData(); })();
}


/* ─────────────────────────────────────────────────────────────
   7. DATA PROCESSING
   Transforms raw API response into G, dayMap, bucketMatrix.
   Triggers all tab renders after processing.
───────────────────────────────────────────────────────────── */
function process(data){
  G = {app:{}, cat:{}, h24:new Array(24).fill(0), total:0, night:0, opens:0};
  dayMap = {}; bucketMatrix = {}; dayP75 = {};

  data.forEach(day => {
    const dt = (typeof day.usage_date==='string' ? day.usage_date : String(day.usage_date)).slice(0,10);
    if(!dayMap[dt]) dayMap[dt] = {app:{}, cat:{}, h24:new Array(24).fill(0), total:0, opens:0};
    const D = dayMap[dt];
    if(!bucketMatrix[dt]) bucketMatrix[dt] = Array.from({length:96}, ()=>({secs:0, apps:{}}));

    (day.buckets || []).forEach(b => {
      const bi = b.bucket||0, h = Math.floor(bi/4);
      const night = h>=22 || h<6;
      const bRow  = bucketMatrix[dt][bi];

      Object.keys(b.apps||{}).forEach(p => {
        const cat = getCat(p);
        if(cat === 'system') return;
        const s = b.apps[p].seconds||0, o = b.apps[p].opens||0;
        if(s===0 && o===0) return;

        G.total+=s; G.opens+=o;
        if(night) G.night+=s;
        G.h24[h] = (G.h24[h]||0)+s;
        if(!G.app[p]) G.app[p] = {s:0, o:0, cat};
        G.app[p].s+=s; G.app[p].o+=o;
        G.cat[cat] = (G.cat[cat]||0)+s;

        D.total+=s; D.opens+=o;
        D.h24[h] = (D.h24[h]||0)+s;
        if(!D.app[p]) D.app[p] = {s:0, o:0, cat};
        D.app[p].s+=s; D.app[p].o+=o;
        D.cat[cat] = (D.cat[cat]||0)+s;

        bRow.secs += s;
        bRow.apps[p] = (bRow.apps[p]||0)+s;
      });
    });
  });

  Object.keys(bucketMatrix).forEach(dt => { dayP75[dt] = computeDayP75(dt); });
  allDays = Object.keys(dayMap).filter(d => dayMap[d].total>0).sort();
  curDate = allDays[allDays.length-1] || '';

  /* Render all tabs in priority order */
  renderOverview();
  renderAppsPage();
  setDay(curDate, false);

  const loader = document.getElementById('loader');
  loader.classList.add('out');
  setTimeout(()=>{ loader.style.display='none'; }, 450);

  setTimeout(()=>{ renderTrends(); renderInsightsPage(); }, 100);
  setTimeout(()=>{ renderPatterns(); renderAIProfile(); }, 200);
}


/* ─────────────────────────────────────────────────────────────
   8. HELPERS — used across all tab render scripts
───────────────────────────────────────────────────────────── */

/* Format seconds → "2h 30m" or "45m" */
function fhm(s){
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  if(h===0) return m+'m';
  return h+'h'+(m>0?' '+m+'m':'');
}

/* Day-of-week abbreviation from ISO date string */
function fdow(dt){
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dt+'T00:00:00').getDay()];
}

/* Animate progress bars — apply data-w value as width% after delay */
function animFills(el, d=180){
  setTimeout(()=>{ el.querySelectorAll('[data-w]').forEach(f=>{ f.style.width=f.dataset.w+'%'; }); }, d);
}

/* Zero-pad a number to 2 digits */
function pad2(n){ return String(n).padStart(2,'0'); }


/* ─────────────────────────────────────────────────────────────
   9. TAB SWITCH — called by onclick on each .tab element
───────────────────────────────────────────────────────────── */
const TABS     = document.querySelectorAll('.tab');
const PAGES_EL = document.querySelectorAll('.page');

function switchTab(i){
  TABS.forEach((t,j)     => t.classList.toggle('active', j===i));
  PAGES_EL.forEach((p,j) => p.classList.toggle('active', j===i));
}