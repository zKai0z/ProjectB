const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { MongoClient, ObjectId } = require("mongodb");

const port = 3000;
const mongoURI = "mongodb+srv://Tyn:admin0123@cluster0.9lmma.mongodb.net/";
const client = new MongoClient(mongoURI);
let dbUser, dbStory, dbComments;

async function connectDB() {
    try {
        await client.connect();
        dbUser = client.db("User");     
        dbStory = client.db("storyDB"); 
        dbComments = client.db("Comments");
        console.log("✅ Kết nối MongoDB thành công!");
    } catch (error) {
        console.error("❌ Lỗi kết nối MongoDB:", error);
        process.exit(1); 
    }
}

async function getStories() {
    return await dbStory.collection("story").find({}).toArray();
}


const Demo = path.join(__dirname, "Project-B");
const htmlDirectory = path.join(Demo, "html");

const getContentType = (filePath) => {
    const ext = path.extname(filePath);
    const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".gif": "image/gif"
    };
    return types[ext] || "text/plain";
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const { ObjectId } = require("mongodb");

    // API Đăng ký
    if (req.method === "POST" && pathname === "/api/signup") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { username, email, password, birthday, gender } = JSON.parse(body);
    
                if (!dbUser) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Database User chưa kết nối!" }));
                }
    
                // Kiểm tra username hoặc email đã tồn tại chưa
                const existingUser = await dbUser.collection("users").findOne({
                    $or: [{ username }, { email }]
                });
    
                if (existingUser) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Username or email already exists" }));
                }
    
                // Kiểm tra giá trị đầu vào
                const newUser = {
                    username,
                    email,
                    password,
                    birthday: birthday || "", // Nếu không có, gán rỗng hoặc một giá trị mặc định
                    gender: gender || "Other", // Mặc định là "Other"
                    followedStories: [],
                    history: []
                };
    
                // Thêm user vào database
                await dbUser.collection("users").insertOne(newUser);
    
                res.writeHead(201, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "User registered successfully" }));
            } catch (error) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Internal Server Error", error: error.message }));
            }
        });
        return;
    }
    

    // API Đăng nhập
    if (req.method === "POST" && pathname === "/api/signin") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { username, password } = JSON.parse(body);

                if (!dbUser) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Database User chưa kết nối!" }));
                }

                // Kiểm tra user có tồn tại không
                const user = await dbUser.collection("users").findOne({ username });
                if (!user) {
                    res.writeHead(401, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Invalid credentials" }));
                }

                // So sánh mật khẩu (không bảo mật, nên sử dụng bcrypt nếu cần)
                if (user.password !== password) {
                    res.writeHead(401, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Invalid credentials" }));
                }

                // Tạo sessionId để quản lý phiên đăng nhập
                const sessionId = new ObjectId().toHexString();
                await dbUser.collection("sessions").insertOne({
                    sessionId,
                    userId: user._id,
                    createdAt: new Date()
                });

                // Gửi phản hồi, chỉ bao gồm thông tin an toàn
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    message: "Login successful",
                    sessionId,
                    user: {
                        userId: user._id,
                        username: user.username,
                        email: user.email,
                        birthday: user.birthday || "",
                        gender: user.gender || ""
                    }
                }));
            } catch (error) {
                if (!res.writableEnded) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Internal Server Error", error: error.message }));
                }
            }
        });
        return;
    }

    
    // API kiểm tra đăng nhập
    if (req.url === "/api/check-login" && req.method === "GET") {
        const sessionId = req.headers["authorization"];

        if (!sessionId) {
            res.writeHead(401, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ loggedIn: false, message: "Unauthorized" }));
        }

        const session = await dbUser.collection("sessions").findOne({ sessionId });
        if (!session) {
            res.writeHead(401, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ loggedIn: false, message: "Session expired" }));
        }

        const user = await dbUser.collection("users").findOne({ _id: new ObjectId(session.userId) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ loggedIn: true, user }));
    }
    
    // API Lấy thông tin user
    if (pathname === "/api/user" && req.method === "GET") {
        const userId = parsedUrl.query.id;
        console.log("Requested user ID:", userId, typeof userId); // Debugging log

        if (!ObjectId.isValid(userId)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid user ID" }));
        }
        // Convert only if it's a valid ObjectId
        const query = ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : { _id: userId };

        const user = await dbUser.collection("users").findOne(query);
        if (!user) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "User not found" }));
        }
        res.writeHead(200, { 
            "Content-Type": "application/json",
            "Connection": "keep-alive"
        });
        
        res.end(JSON.stringify(user));
        return;
    }

    // API Cập nhật thông tin User
    if (req.method === "PUT" && pathname === "/api/user") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { id } = url.parse(req.url, true).query; // Lấy ID từ URL
                if (!id) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "User ID không hợp lệ" }));
                }

                const { username, email, birthday, gender } = JSON.parse(body);

                // Cập nhật dữ liệu trong database
                await dbUser.collection("users").updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { username, email, birthday, gender } }
                );

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Cập nhật thành công" }));
            } catch (error) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Lỗi server", error: error.message }));
            }
        });
        return;
    }

    // API Lấy danh sách truyện
    if (pathname === "/api/stories" && req.method === "GET") {
        try {
            const stories = await getStories(); // Lấy trực tiếp từ MongoDB
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(stories));
        } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Không thể lấy danh sách truyện" }));
        }
        return;
    }

    // API cập nhật thông tin truyện
    if (pathname === "/api/story/update" && req.method === "PUT") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { id, author, status, genre, followers } = JSON.parse(body);

                if (!id) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Thiếu ID truyện" }));
                }

                const db = client.db("storyDB");
                const collection = db.collection("story");

                const updateResult = await collection.updateOne(
                    { _id: id },
                    {
                        $set: {
                            author: author || "",
                            status: status || "Đang cập nhật",
                            genre: Array.isArray(genre) ? genre : [genre],
                            followers: typeof followers === "number" ? followers : 0
                        }
                    }
                );

                if (updateResult.modifiedCount === 1) {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Cập nhật thành công" }));
                } else {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Không tìm thấy truyện hoặc không có thay đổi" }));
                }
            } catch (err) {
                console.error("Lỗi update:", err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Lỗi khi cập nhật truyện" }));
            }
        });
        return;
    }

    // API Update followedStories cho user
    if (req.method === "PUT" && pathname.startsWith("/api/user/") && pathname.endsWith("/followedStories")) {
        const parts = pathname.split("/");
        const userId = parts[3]; 

        if (!ObjectId.isValid(userId)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid user ID" }));
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { followedStories } = JSON.parse(body);

                const result = await dbUser.collection("users").updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { followedStories } }
                );

                if (result.modifiedCount === 1) {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Updated followed stories" }));
                } else {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "No changes made" }));
                }
            } catch (error) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Internal server error", error: error.message }));
            }
        });
        return;
    }

    // APi cập nhật followers
    if (req.method === 'PUT' && pathname === '/api/stories') {
        const storyId = parsedUrl.query.id; // dùng parsedUrl.query.id để lấy ID
        if (!storyId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Thiếu storyId trong query string.' }));
            return;
        }
    
        let body = '';
    
        req.on('data', chunk => {
            body += chunk;
        });
    
        req.on('end', async () => {
            try {
                const { increment } = JSON.parse(body);
                const storyCollection = dbStory.collection("story");
                const result = await storyCollection.updateOne(
                    { _id: storyId },
                    { $inc: { followers: increment } }
                );                  
    
                if (result.modifiedCount === 0) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Không tìm thấy truyện để cập nhật.' }));
                    return;
                }
    
                const updatedStory = await storyCollection.findOne({ _id: storyId });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    message: 'Cập nhật followers thành công.', 
                    followers: updatedStory.followers || 0 
                }));
            } catch (err) {
                console.error("Lỗi cập nhật followers:", err);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Lỗi khi cập nhật followers.' }));
                }
            }
        });
        return;    
    }    

    // API thêm bình luận
    if (pathname === "/api/comments" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { storyId, chapterId, userId, comment } = JSON.parse(body);
    
                if (!storyId || !chapterId || !userId || !comment) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Thiếu thông tin." }));
                }
    
                const newComment = {
                    userId,
                    comment,
                    timestamp: new Date()
                };
    
                const result = await dbComments.collection("StoryComs").updateOne(
                    { storyId },
                    { $push: { [`chapters.${chapterId}`]: newComment } },
                    { upsert: true }
                );
    
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Đã lưu bình luận thành công", result }));
            } catch (error) {
                console.error("Lỗi khi lưu bình luận:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Lỗi server", error: error.message }));
            }
        });
        return;
    }    

    // API lấy bình luận
    if (pathname === "/api/comments" && req.method === "GET") {
        const { storyId, chapterId } = parsedUrl.query;
    
        if (!storyId || !chapterId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Thiếu tham số storyId hoặc chapterId." }));
        }
    
        try {
            const doc = await dbComments.collection("StoryComs").findOne({ storyId });
            const comments = doc?.chapters?.[chapterId] || [];
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(comments));
        } catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Lỗi server", error: error.message }));
        }
    }
    
    // ✅ API like / dislike comment
    if (pathname === "/api/comments/react" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { storyId, chapterId, commentIndex, userId, action } = JSON.parse(body);

                if (!storyId || !chapterId || commentIndex == null || !userId || !["like", "dislike"].includes(action)) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Dữ liệu không hợp lệ." }));
                }

                const likeField = `chapters.${chapterId}.${commentIndex}.likes`;
                const dislikeField = `chapters.${chapterId}.${commentIndex}.dislikes`;

                const update = action === "like"
                    ? {
                        $addToSet: { [likeField]: userId },
                        $pull: { [dislikeField]: userId }
                    }
                    : {
                        $addToSet: { [dislikeField]: userId },
                        $pull: { [likeField]: userId }
                    };

                await dbComments.collection("StoryComs").updateOne({ storyId }, update);

                // ✅ Sau khi cập nhật, lấy lại comment cụ thể
                const updatedDoc = await dbComments.collection("StoryComs").findOne({ storyId });

                const comment = updatedDoc?.chapters?.[chapterId]?.[commentIndex];
                if (!comment) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Không tìm thấy bình luận." }));
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    message: "Đã cập nhật phản hồi",
                    likes: comment.likes?.length || 0,
                    dislikes: comment.dislikes?.length || 0
                }));
            } catch (error) {
                console.error("Lỗi khi xử lý like/dislike:", error);
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Lỗi server", error: error.message }));
                }
            }
        });
        return;
    }
    
    // API reply comment
    if (pathname === "/api/comments/reply" && req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { storyId, chapterId, commentIndex, reply } = JSON.parse(body);

                if (!storyId || !chapterId || commentIndex == null || !reply?.userId || !reply.comment) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Thiếu thông tin." }));
                }

                const replyWithTimestamp = {
                    ...reply,
                    timestamp: new Date()
                };
                
                reply.likes = [];
                reply.dislikes = [];

                const field = `chapters.${chapterId}.${commentIndex}.replies`;

                const result = await dbComments.collection("StoryComs").updateOne(
                    { storyId },
                    { $push: { [field]: reply } }
                );

                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Đã thêm trả lời", result }));
            } catch (error) {
                console.error("Lỗi khi thêm trả lời:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Lỗi server", error: error.message }));
            }
        });
        return;
    }

    // API add-stories
    if (req.method === "POST" && pathname === "/add-story") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { _id, title, author, status, genre, userId } = JSON.parse(body);

                if (!_id || !title || !author || !genre || !userId) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Thiếu dữ liệu", success: false }));
                }

                const newStory = {
                    _id,
                    title,
                    image: "",
                    chapters: {},
                    views: "0",
                    followers: 0,
                    author,
                    status: status || "Đang cập nhật",
                    genre: genre || "Chưa phân loại",
                };

                await dbStory.collection("story").insertOne(newStory);

                const userCol = dbUser.collection("users");

                // Kiểm tra nếu userId hợp lệ
                if (!ObjectId.isValid(userId)) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "User ID không hợp lệ", success: false }));
                }

                const userObjectId = new ObjectId(userId);  
                const existingUser = await userCol.findOne({ _id: userObjectId });

                if (existingUser) {
                    // Đảm bảo rằng uploadstories là một mảng
                    if (!existingUser.uploadstories) {
                        existingUser.uploadstories = [];
                    }

                    // Thêm truyện vào uploadstories của user
                    await userCol.updateOne(
                        { _id: userObjectId },
                        { $addToSet: { uploadstories: _id } }
                    );
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Thêm truyện thành công", success: true }));
            } catch (err) {
                console.error(err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Lỗi server", success: false }));
            }
        });
        return;
    }

    // API lấy danh sách truyện đã tải lên của user
    if (req.method === "GET" && pathname.startsWith("/user-stories/")) {
        const userId = pathname.split("/").pop();
    
        try {
            if (!ObjectId.isValid(userId)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "User ID không hợp lệ", success: false }));
            }
    
            const user = await dbUser.collection("users").findOne({ _id: new ObjectId(userId) });
    
            if (!user || !user.uploadstories || user.uploadstories.length === 0) {
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify([]));
            }
    
            const stories = await dbStory.collection("story").find({
                _id: { $in: user.uploadstories }
            }).toArray();
    
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(stories));
        } catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Lỗi server", success: false }));
        }
        return;
    }    
    
    // update history
    if (req.method === "PUT" && pathname.startsWith("/api/user/") && pathname.endsWith("/history")) {
        const parts = pathname.split("/");
        const userId = parts[3]; 

        if (!ObjectId.isValid(userId)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid user ID" }));
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { history } = JSON.parse(body);

                const result = await dbUser.collection("users").updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { history } }
                );

                if (result.modifiedCount === 1) {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "Updated history" }));
                } else {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ message: "No changes made" }));
                }
            } catch (error) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "Internal server error", error: error.message }));
            }
        });
        return;
    }
    
    // Phục vụ file tĩnh
    let requestedFile = pathname === "/" ? "/home.html" : pathname;
    const filePath = path.join(htmlDirectory, requestedFile);

    if (!filePath.startsWith(htmlDirectory)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            return res.end("Error: File Not Found");
        }
    
        res.writeHead(200, { "Content-Type": getContentType(filePath) });
        fs.createReadStream(filePath).pipe(res);
    });    
});

// Kết nối MongoDB và khởi chạy server
connectDB().then(() => {
    server.listen(port, () => {
        console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
    });
});
