// Command: node deploy-to-r2.js
const { promises: fs } = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const readline = require('readline');

// Konfigurasi
const CONFIG = {
  sourceDir: '.', // Direktori lokal proyek
  bucket: 'hugo-project', // Nama bucket R2
  endpoint: 'https://04d9baa6919e14070fff9cf7c046faad.r2.cloudflarestorage.com', // Endpoint R2
  region: 'auto', // Region R2
  excludeDirs: ['.git', '.github'], // Direktori yang diabaikan
  credentials: {
    accessKeyId: '5cf28f11fcfc7900f6753afab9a25788', // Jangan hardcode ini, gunakan ENV
    secretAccessKey: '3bd5fc127d0e5ad91558bd49a0658ecacab64a103e5c2bea9fed84fd7bede321',
  },
};

// Inisialisasi klien S3 (AWS SDK)
const client = new S3Client({
  region: CONFIG.region,
  endpoint: CONFIG.endpoint,
  credentials: CONFIG.credentials,
});

// Fungsi untuk membaca input pengguna
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => rl.question(query, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

// Fungsi untuk mendapatkan semua file dalam direktori secara rekursif
async function getAllFiles(dir, fileList = []) {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    // Skip excluded directories
    if (CONFIG.excludeDirs.includes(file)) {
      continue;
    }

    if (stat.isDirectory()) {
      await getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }

  return fileList;
}

// Fungsi untuk menghitung hash SHA-256 dari sebuah file
async function calculateFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Fungsi untuk memeriksa apakah file perlu diunggah berdasarkan metadata hash
async function fileNeedsUpload(bucket, key, localFilePath) {
  try {
    const localHash = await calculateFileHash(localFilePath);

    // Periksa metadata file di bucket
    const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(headCommand);

    // Ambil hash dari metadata
    const remoteHash = response.Metadata?.hash;

    // Bandingkan hash lokal dengan hash dari metadata
    return localHash !== remoteHash;
  } catch (err) {
    if (err.name === 'NotFound') {
      return true; // File tidak ada di bucket, perlu diunggah
    }
    throw err; // Lempar error untuk kasus lain
  }
}

// Fungsi untuk mengunggah file
async function uploadFile(filePath, relativePath) {
  const r2Path = relativePath.split(path.sep).join('/');
  const fileContent = await fs.readFile(filePath);
  const fileHash = await calculateFileHash(filePath);

  await client.send(new PutObjectCommand({
    Bucket: CONFIG.bucket,
    Key: r2Path,
    Body: fileContent,
    Metadata: { hash: fileHash },
  }));

  console.log(`Uploaded: ${relativePath}`);
}

// Fungsi untuk menghapus file
async function deleteFile(r2Path) {
  await client.send(new DeleteObjectCommand({
    Bucket: CONFIG.bucket,
    Key: r2Path,
  }));
  console.log(`Deleted: ${r2Path}`);
}

// Fungsi untuk daftar file di bucket
async function listFiles() {
  const command = new ListObjectsV2Command({ Bucket: CONFIG.bucket });
  const response = await client.send(command);
  return response.Contents?.map((item) => item.Key) || [];
}

// Fungsi utama untuk memilih mode deploy
async function deployMode() {
  console.log('1. Deploy file');
  console.log('2. Deploy folder');
  console.log('3. Delete file');
  console.log('4. Delete folder');
  console.log('5. Delete all files');
  
  const mode = await askQuestion('Pilih mode (1-5): ');

  switch (mode) {
    case '1': {
      const filePath = await askQuestion('Masukkan path file yang ingin di-deploy: ');
      const relativePath = path.relative(CONFIG.sourceDir, filePath);
      await uploadFile(filePath, relativePath);
      break;
    }

    case '2': {
      const folderPath = await askQuestion('Masukkan path folder yang ingin di-deploy: ');
      const files = await getAllFiles(folderPath);
      for (const file of files) {
        const relativePath = path.relative(CONFIG.sourceDir, file);
        await uploadFile(file, relativePath);
      }
      break;
    }

    case '3': {
      const r2Path = await askQuestion('Masukkan path file di bucket yang ingin dihapus: ');
      await deleteFile(r2Path);
      break;
    }

    case '4': {
      const folderPath = await askQuestion('Masukkan path folder di bucket yang ingin dihapus: ');
      const files = await listFiles();
      for (const file of files) {
        if (file.startsWith(folderPath)) {
          await deleteFile(file);
        }
      }
      break;
    }

    case '5': {
      const confirmation = await askQuestion('Apakah Anda yakin ingin menghapus semua file? (yes/no): ');
      if (confirmation.toLowerCase() === 'yes') {
        const files = await listFiles();
        for (const file of files) {
          await deleteFile(file);
        }
        console.log('Semua file telah dihapus.');
      }
      break;
    }

    default:
      console.log('Pilihan tidak valid.');
  }
}

// Jalankan mode deploy
deployMode();