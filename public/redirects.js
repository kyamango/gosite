// Redirect Map
const redirectMap = {
    "/tak-berkategori/jual-pasir-silika?amp": "/product/jual-pasir-silika/amp/",
};
(function () {
    function getCurrentPath() {
        // Ambil path + query string
        let path = window.location.pathname + window.location.search;
        path = path.replace(/\/$/, '') || '/';
        return path;
    }
    document.addEventListener('DOMContentLoaded', () => {
        const currentPath = getCurrentPath();
        const redirectUrl = redirectMap[currentPath] || 
                            redirectMap[currentPath + '/'] || 
                            redirectMap[currentPath.replace(/\/$/, '')];
        if (redirectUrl) {
            console.log(`Redirecting from ${currentPath} to ${redirectUrl}`);
            window.location.replace(window.location.origin + redirectUrl);
        }
    });
})();