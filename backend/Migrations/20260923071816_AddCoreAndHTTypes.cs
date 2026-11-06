using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddCoreAndHTTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoreType",
                table: "MasterParts",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HTType",
                table: "MasterParts",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoreType",
                table: "MasterParts");

            migrationBuilder.DropColumn(
                name: "HTType",
                table: "MasterParts");
        }
    }
}
