# วิธีนำ ClassOps-AI 3.5.0 ขึ้น GitHub

ชุดนี้เป็นโค้ดต้นฉบับ ไม่ใช่ตัวโปรแกรม .exe ไม่มีคีย์จริงหรือไฟล์ส่วนตัว

## ลงโค้ดผ่านเว็บไซต์

1. ดาวน์โหลด ZIP โค้ดแล้วเลือก Extract All เพื่อแตกไฟล์ก่อน
2. เข้า GitHub และเข้าสู่ระบบด้วยบัญชีของคุณ ทำขั้นตอนเข้าสู่ระบบเอง ไม่ส่งรหัสผ่านหรือ token ในแชต
3. เลือก New repository ตั้งชื่อ เช่น `classops-ai` เลือก Private ถ้าต้องการเก็บส่วนตัว หรือ Public ถ้าตั้งใจเผยแพร่ ไม่ต้องเพิ่ม README/license/gitignore ใหม่ เพราะชุดนี้มีแล้ว
4. เปิด repository เลือก Upload files หรือ uploading an existing file หาก repository ยังว่าง
5. ลาก **ไฟล์และโฟลเดอร์ภายในโฟลเดอร์ที่แตกแล้ว** ไปอัปโหลด ไม่อัปโหลด ZIP อย่างเดียว และไม่ให้มีโฟลเดอร์ครอบเพิ่ม ให้ `index.html`, `package.json`, `README.md` อยู่ราก repository ส่วน `desktop/`, `vendor/`, `tests/` คงโครงสร้างเดิม
6. ตรวจว่าไม่มี `.env`, คีย์จริง, `node_modules/`, `dist/`, เอกสารส่วนตัว หรือ `.exe` ในรายการ `.env.example` อัปโหลดได้เพราะไม่มีคีย์จริง
7. ใส่ข้อความ commit เช่น `Add ClassOps-AI 3.5.0` และกดปุ่มยืนยันอัปโหลด/commit ที่ GitHub แสดง ตรวจว่ารายชื่อไฟล์และ README ปรากฏครบ

ดู [คู่มืออัปโหลดของ GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) เว็บจำกัด 25 MiB ต่อไฟล์และสูงสุด 100 ไฟล์ต่อครั้ง ชุด source นี้อยู่ภายในขอบเขตดังกล่าว หากแก้ไฟล์ใน branch ที่ป้องกันไว้ ให้ทำ branch/PR ตามกฎของ repository

## แจกโปรแกรม Windows ผ่าน Releases

หลังอัปโหลดโค้ด ไป Releases → Draft a new release หรือ Create a new release

1. สร้าง tag `v3.5.0` ตั้งชื่อ `ClassOps-AI 3.5.0`
2. เขียนความสามารถและข้อจำกัด: ผู้ใช้ใส่คีย์ Gemini ของตนเอง และใช้ Word desktop สำหรับคำนวณหน้า
3. แนบ `ClassOps-AI-Portable-3.5.0-x64.exe`, `ClassOps-AI-Setup-3.5.0-x64.exe` และไฟล์ SHA-256 จากชุดส่งมอบ
4. ตรวจไฟล์แล้ว Publish release เมื่อพร้อม ไม่ commit .exe ปน source

[Releases รองรับไฟล์โปรแกรมประกอบเวอร์ชัน](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) โปรแกรมนี้ยังไม่ลงนามดิจิทัล ไม่แนะนำให้ปิดระบบความปลอดภัยของเครื่อง

## GitHub Pages ถ้าต้องการเว็บเดโม

ไม่ต้องเปิด Pages เพื่อเก็บโค้ดหรือแจก .exe และ Pages ไม่ทำให้ Gemini backend ทำงาน

1. หากใช้ GitHub Free สำหรับ Pages repository ต้องเป็น Public เลือกเผยแพร่โดยตั้งใจ อย่านำข้อมูลลับไปไว้ใน repository
2. ให้ `index.html`, `styles.css`, `enhancements.css`, `app.bundle.js`, `vendor/` อยู่ราก source ที่ใช้เผยแพร่
3. Settings → Pages → Build and deployment → Source: Deploy from a branch
4. เลือก branch ที่มีโค้ด เช่น `main` และ `/(root)` แล้ว Save
5. รอ URL ที่ GitHub แสดง แล้วกด Visit site

รายละเอียดขึ้นกับแผนบัญชี ดู [คู่มือ GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) Pages เป็น static hosting จึงไม่มี backend AI/Word desktop แอปจะไม่ส่งคีย์จาก Pages ใช้เต็มฟีเจอร์ผ่าน Windows app หรือ backend บนเครื่องแทน

## ถ้าจะให้ผู้ช่วยอัปโหลดแทน

ติดตั้ง GitHub integration ใน Codex และเชื่อมบัญชีผ่านหน้าลงชื่อเข้าใช้ GitHub แล้วบอก:

- URL repository ที่คุณมีสิทธิ์เขียน หรือชื่อ repository ใหม่และบัญชี/องค์กรเจ้าของ
- Private หรือ Public
- อัปโหลดเฉพาะโค้ด หรือให้สร้าง Release แนบ .exe ด้วย

ต้องตรวจสิทธิ์และความสามารถที่เชื่อมจริงก่อนทำงาน ไม่รับประกันว่า integration จะสร้าง repository/release ได้ทุกแบบ ไม่ขอรหัสผ่านหรือ API key ในแชต

## ตรวจชุดก่อนลง

- ห้ามฝังคีย์ใน JavaScript/HTML หรืออัปโหลด .env จริง
- ข้อมูลร่าง/เอกสารผู้ใช้ไม่ควรอยู่ใน GitHub
- LICENSE และ vendor/JSZip-LICENSE.txt ต้องอยู่ครบ
- หากแก้ source ให้รัน `node build.js` ก่อนอัปโหลด bundle
- ทดสอบเองด้วย `npm install` แล้ว `npm test` (Node.js 22.12 ขึ้นไปสำหรับ development tools)
