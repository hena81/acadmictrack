# نظام اختيار الشعبة الدراسية

مشروع عربي RTL لإدارة اختيار الشعبة الدراسية للطلاب، مبني بواجهات HTML وJavaScript وTailwindCSS، مع API بسيطة بـ Node.js لحفظ البيانات في ملف JSON.

## التشغيل

```bash
npm start
```

ثم افتح:

- صفحة الطالب: `http://localhost:3000`
- دخول الأدمن: `http://localhost:3000/admin-login.html`
- فحص الخادم: `http://localhost:3000/api/health`

بيانات الدخول الافتراضية:

- اسم المستخدم: `admin`
- كلمة المرور: `admin123`

## بنية المشروع

```text
server.js              API والخادم المحلي
data/store.json        ملف التخزين الأساسي
data/store.backup.json نسخة احتياطية تلقائية بعد أول حفظ
public/index.html      صفحة الطالب
public/about.html      صفحة التعريف بالمشروع ودليل الاستخدام
public/admin-login.html صفحة تسجيل دخول الأدمن
public/dashboard.html  لوحة التحكم
public/js              ملفات JavaScript للواجهات
public/assets/logo.svg شعار افتراضي
```

## أعمدة ملف Excel

يدعم الاستيراد الأعمدة التالية:

- `الرقم المدني`
- `الاسم`
- `الصف`
- `الشعبة`
- `التشعيب`

كما يمكن التصدير إلى ملف `students.xlsx` من لوحة التحكم.

## ملاحظات

- يتم منع تكرار الرقم المدني واسم المستخدم من الخادم.
- حفظ اختيار الطالب يحدث عبر `/api/selections` ويُحدث التشعيب الحالي للطالب.
- مكتبتا TailwindCSS وSheetJS وLucide تُحمّل عبر CDN، لذلك تحتاج الواجهة إلى اتصال إنترنت لعرض Tailwind والأيقونات وتشغيل Excel من المتصفح.

## النشر على استضافة حقيقية

هذا المشروع لا يعمل بشكل كامل على استضافة ملفات ثابتة فقط مثل GitHub Pages أو أي رفع مباشر لمجلد `public`، لأن البحث وتسجيل الدخول والحفظ يعتمدون على مسارات `/api/...` الموجودة في `server.js`.

انشر المشروع كتطبيق Node.js، ثم اجعل أمر التشغيل:

```bash
npm start
```

بعد النشر افتح:

```text
https://your-domain.com/api/health
```

إذا ظهرت استجابة JSON فيها `ok: true` فالـ API يعمل. إذا ظهرت صفحة HTML أو خطأ 404/403، فالاستضافة لا تشغّل `server.js` أو أن إعدادات توجيه الطلبات إلى تطبيق Node غير صحيحة.

تنبيه مهم: لأن التخزين يتم في `data/store.json`، يجب أن تكون الاستضافة تسمح بالكتابة على ملفات المشروع أو توفر قرصًا دائمًا. بعض الاستضافات/serverless تجعل الملفات للقراءة فقط أو تمسح التغييرات بعد إعادة التشغيل؛ في هذه الحالة يلزم VPS أو Node hosting بقرص دائم، أو تحويل التخزين إلى قاعدة بيانات.

### إعداد SmarterASP.NET

SmarterASP.NET يشغل تطبيقات Node.js عبر IIS و`httpPlatformHandler`. لذلك يجب رفع ملف `web.config` الموجود في جذر المشروع مع `server.js`.

ارفع هذه الملفات والمجلدات إلى جذر الموقع:

```text
server.js
web.config
package.json
public/
data/
```

لا ترفع مجلد `public` فقط، لأن مسارات `/api/...` موجودة في `server.js`.

من لوحة SmarterASP.NET فعّل Node.js للموقع، ثم افتح:

```text
https://your-domain.com/api/health
```

إذا رجع JSON وفيه `ok: true` فالإعداد صحيح. إذا رجع 404 أو صفحة HTML، فهذا يعني أن `web.config` غير مرفوع في جذر الموقع أو أن Node.js غير مفعل للموقع.
