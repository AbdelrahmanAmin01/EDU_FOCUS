# دليل نظام المصادقة والتوكن

## الميزات الجديدة المضافة

### 1. تشفير كلمات المرور
- تم إضافة تشفير كلمات المرور باستخدام `bcryptjs`
- جميع كلمات المرور الجديدة ستكون مشفرة
- مقارنة آمنة لكلمات المرور عند تسجيل الدخول

### 2. نظام JWT Tokens
- إصدار توكن عند تسجيل الدخول الناجح
- التوكن صالح لمدة 24 ساعة
- التحقق من التوكن في المسارات المحمية

### 3. Middleware للمصادقة
- `authenticateToken`: للتحقق من صحة التوكن
- حماية المسارات الحساسة
- التحقق من الصلاحيات

## المسارات الجديدة

### `/login` - تسجيل الدخول
```json
POST /login
{
  "email": "user@example.com",
  "password": "password123"
}
```

**الاستجابة:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id",
    "name": "User Name",
    "email": "user@example.com",
    "role": "STUDENT",
    "profile_image_url": "/uploads/image.jpg"
  }
}
```

### `/verify-token` - التحقق من التوكن
```json
GET /verify-token
Authorization: Bearer your-jwt-token
```

### `/me` - معلومات المستخدم الحالي
```json
GET /me
Authorization: Bearer your-jwt-token
```

## المسارات المحمية

جميع المسارات التالية تتطلب توكن صالح:

- `PUT /users/:id` - تحديث المستخدم
- `DELETE /users/:id` - حذف المستخدم
- `GET /users` - قائمة المستخدمين (للمدراء فقط)
- `POST /meetings` - إنشاء اجتماع
- `PUT /meetings/:id` - تحديث اجتماع
- `DELETE /meetings/:id` - حذف اجتماع
- `POST /participants` - إضافة مشارك
- `PUT /participants/:id` - تحديث مشارك
- `DELETE /participants/:id` - حذف مشارك

## كيفية الاستخدام

### 1. تسجيل الدخول
```javascript
const response = await fetch('/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const data = await response.json();
const token = data.token;
```

### 2. استخدام التوكن في الطلبات
```javascript
const response = await fetch('/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### 3. إنشاء اجتماع
```javascript
const response = await fetch('/meetings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    room_name: 'Meeting Room 1',
    s_date: '2024-01-01T10:00:00Z',
    e_date: '2024-01-01T11:00:00Z'
  })
});
```

## متغيرات البيئة

قم بإنشاء ملف `.env` في المجلد الجذر:

```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-12345
```

## الصلاحيات

### المستخدم العادي (STUDENT)
- يمكنه تحديث بياناته الشخصية
- يمكنه حذف حسابه
- يمكنه إنشاء الاجتماعات
- يمكنه إدارة الاجتماعات التي أنشأها

### المدير (ADMIN)
- جميع صلاحيات المستخدم العادي
- يمكنه رؤية جميع المستخدمين
- يمكنه إدارة جميع الاجتماعات
- يمكنه إدارة جميع المشاركين

## ملاحظات الأمان

1. **تغيير JWT_SECRET**: تأكد من تغيير `JWT_SECRET` في الإنتاج
2. **HTTPS**: استخدم HTTPS في الإنتاج
3. **انتهاء صلاحية التوكن**: التوكنات تنتهي صلاحيتها بعد 24 ساعة
4. **تشفير كلمات المرور**: جميع كلمات المرور مشفرة في قاعدة البيانات

## استكشاف الأخطاء

### خطأ 400 - Bad Request
**الإيميل موجود مسبقاً:**
```json
{
  "success": false,
  "error": "Email already exists",
  "message": "An account with this email already exists"
}
```
**الحل:** استخدم إيميل مختلف أو سجل دخول بالحساب الموجود

**بيانات ناقصة:**
```json
{
  "success": false,
  "error": "Missing required fields",
  "message": "Name, email, and password are required"
}
```
**الحل:** تأكد من إرسال جميع البيانات المطلوبة

### خطأ 401 - Unauthorized
- تحقق من وجود التوكن في header
- تحقق من صحة التوكن
- تحقق من انتهاء صلاحية التوكن

### خطأ 403 - Forbidden
- تحقق من الصلاحيات المطلوبة
- تحقق من دور المستخدم

### خطأ 404 - Not Found
- تحقق من وجود المورد المطلوب
- تحقق من صحة معرف المورد

### خطأ 500 - Internal Server Error
- تحقق من اتصال قاعدة البيانات
- تحقق من صحة البيانات المرسلة
